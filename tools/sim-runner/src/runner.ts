import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  SCENARIOS,
  WORKLOADS,
  exportRunConfiguration,
} from "@linxsimcity/scenarios";

import { validateResultBundle } from "./manifest.js";
import type {
  LocalRunnerOptions,
  SimulationJob,
  StartSimulationRequest,
} from "./types.js";

const MAX_LOG_BYTES = 64 * 1024;

interface MutableJob {
  id: string;
  status: SimulationJob["status"];
  configuration: SimulationJob["configuration"];
  configSha256: string;
  simulatorArguments: string[];
  createdAt: string;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  diagnostic?: string;
  stdout: string;
  stderr: string;
  result?: SimulationJob["result"];
  cancellationRequested: boolean;
  child?: ChildProcess;
}

interface ResolvedRunnerOptions {
  executablePath: string;
  workingDirectory: string;
  resultsDirectory: string;
  simulatorRevision: string;
  workloads: Record<string, { path: string; sha256: string }>;
}

function snapshot(job: MutableJob): SimulationJob {
  return structuredClone({
    id: job.id,
    status: job.status,
    configuration: job.configuration,
    configSha256: job.configSha256,
    simulatorArguments: job.simulatorArguments,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
    ...(job.exitCode !== undefined ? { exitCode: job.exitCode } : {}),
    ...(job.diagnostic ? { diagnostic: job.diagnostic } : {}),
    stdout: job.stdout,
    stderr: job.stderr,
    ...(job.result ? { result: job.result } : {}),
  });
}

function appendBounded(existing: string, chunk: Buffer): string {
  if (Buffer.byteLength(existing) >= MAX_LOG_BYTES) return existing;
  return Buffer.concat([Buffer.from(existing), chunk])
    .subarray(0, MAX_LOG_BYTES)
    .toString("utf8");
}

async function resolveFile(path: string, executable: boolean): Promise<string> {
  const resolved = await realpath(resolve(path));
  const metadata = await stat(resolved);
  if (!metadata.isFile()) throw new Error(`${path} is not a regular file`);
  if (executable) await access(resolved, constants.X_OK);
  return resolved;
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

export class LocalSimulationRunner {
  readonly #options: ResolvedRunnerOptions;
  readonly #jobs = new Map<string, MutableJob>();

  private constructor(options: ResolvedRunnerOptions) {
    this.#options = options;
  }

  static async create(
    options: LocalRunnerOptions,
  ): Promise<LocalSimulationRunner> {
    if (!/^[a-f0-9]{7,64}$/.test(options.simulatorRevision)) {
      throw new Error("simulator revision must be a hexadecimal revision");
    }
    const executablePath = await resolveFile(options.executablePath, true);
    const workingDirectory = await realpath(
      resolve(options.workingDirectory ?? dirname(executablePath)),
    );
    const workingMetadata = await stat(workingDirectory);
    if (!workingMetadata.isDirectory()) {
      throw new Error("runner working directory is not a directory");
    }
    await mkdir(resolve(options.resultsDirectory), { recursive: true });
    const resultsDirectory = await realpath(resolve(options.resultsDirectory));
    const workloads: Record<string, { path: string; sha256: string }> = {};
    for (const workloadId of Object.keys(
      WORKLOADS,
    ) as (keyof typeof WORKLOADS)[]) {
      const resource = options.workloads[workloadId];
      if (!resource)
        throw new Error(`missing workload resource: ${workloadId}`);
      const path = await resolveFile(resource.path, false);
      const sha256 = await sha256File(path);
      if (resource.sha256 && sha256 !== resource.sha256) {
        throw new Error(`workload SHA-256 mismatch for ${workloadId}`);
      }
      workloads[workloadId] = { path, sha256 };
    }
    return new LocalSimulationRunner({
      executablePath,
      workingDirectory,
      resultsDirectory,
      simulatorRevision: options.simulatorRevision,
      workloads,
    });
  }

  listJobs(): readonly SimulationJob[] {
    return [...this.#jobs.values()].map(snapshot);
  }

  getJob(id: string): SimulationJob | undefined {
    const job = this.#jobs.get(id);
    return job ? snapshot(job) : undefined;
  }

  start(request: StartSimulationRequest): SimulationJob {
    const exported = exportRunConfiguration(request.configuration);
    if (request.configSha256 !== exported.configSha256) {
      throw new Error(
        "stale config hash; export the configuration again before running",
      );
    }
    if (
      request.simulatorOverrides.length !==
        exported.simulatorOverrides.length ||
      request.simulatorOverrides.some(
        (value, index) => value !== exported.simulatorOverrides[index],
      )
    ) {
      throw new Error(
        "simulator overrides do not match the typed configuration",
      );
    }

    const workload =
      this.#options.workloads[exported.configuration.workloadId]!;
    const workloadDefinition = WORKLOADS[exported.configuration.workloadId];
    const scenario = SCENARIOS[exported.configuration.scenarioId];
    if (
      scenario.backendId !== exported.configuration.backendId ||
      scenario.workloadId !== exported.configuration.workloadId
    ) {
      throw new Error(
        "unsupported backend, workload, and scenario combination",
      );
    }

    const id = randomUUID();
    const bundlePath = join(this.#options.resultsDirectory, `${id}.bundle`);
    const traceOverrides = [
      "trace.linx_enable=true",
      "trace.linx_profile=pipeline",
      `trace.linx_output=${bundlePath}`,
      `trace.linx_run_id=${id}`,
      `trace.linx_simulator_revision=${this.#options.simulatorRevision}`,
      `trace.linx_config_sha256=${exported.configSha256}`,
      `trace.linx_workload_name=${workloadDefinition.simulatorName}`,
      `trace.linx_workload_sha256=${workload.sha256}`,
    ];
    const simulatorArguments = [
      "-f",
      workload.path,
      "-s",
      ...exported.simulatorOverrides,
      ...traceOverrides,
    ];
    const now = new Date().toISOString();
    const job: MutableJob = {
      id,
      status: "running",
      configuration: exported.configuration,
      configSha256: exported.configSha256,
      simulatorArguments,
      createdAt: now,
      startedAt: now,
      stdout: "",
      stderr: "",
      cancellationRequested: false,
    };
    this.#jobs.set(id, job);

    const child = spawn(this.#options.executablePath, simulatorArguments, {
      cwd: this.#options.workingDirectory,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    job.child = child;
    child.stdout?.on("data", (chunk: Buffer) => {
      job.stdout = appendBounded(job.stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      job.stderr = appendBounded(job.stderr, chunk);
    });
    child.once("error", (error) => {
      if (job.finishedAt) return;
      job.status = job.cancellationRequested ? "cancelled" : "failed";
      job.diagnostic = `could not start simulator: ${error.message}`;
      job.finishedAt = new Date().toISOString();
      delete job.child;
    });
    child.once("close", (code, signal) => {
      void this.#finish(
        job,
        bundlePath,
        workloadDefinition.simulatorName,
        workload.sha256,
        code,
        signal,
      );
    });
    return snapshot(job);
  }

  cancel(id: string): SimulationJob | undefined {
    const job = this.#jobs.get(id);
    if (!job) return undefined;
    if (job.status !== "running") return snapshot(job);
    job.cancellationRequested = true;
    job.status = "cancelling";
    job.child?.kill("SIGTERM");
    return snapshot(job);
  }

  async close(): Promise<void> {
    const active = [...this.#jobs.values()].filter((job) => job.child);
    const completions = active.map(
      (job) =>
        new Promise<void>((done) => {
          if (!job.child) return done();
          job.child.once("close", () => done());
        }),
    );
    for (const job of active) this.cancel(job.id);
    await Promise.all(completions);
  }

  async #finish(
    job: MutableJob,
    bundlePath: string,
    workloadName: string,
    workloadSha256: string,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Promise<void> {
    if (job.finishedAt) return;
    delete job.child;
    job.finishedAt = new Date().toISOString();
    if (job.cancellationRequested) {
      job.status = "cancelled";
      job.diagnostic = signal
        ? `simulator cancelled with ${signal}`
        : "simulator cancelled";
      return;
    }
    if (code !== null) job.exitCode = code;
    if (code !== 0) {
      job.status = "failed";
      job.diagnostic = signal
        ? `simulator terminated with ${signal}`
        : `simulator exited with ${code ?? "no status"}`;
      return;
    }
    try {
      job.result = await validateResultBundle(bundlePath, {
        runId: job.id,
        simulatorRevision: this.#options.simulatorRevision,
        configSha256: job.configSha256,
        workloadName,
        workloadSha256,
      });
      job.status = "succeeded";
    } catch (error) {
      job.status = "failed";
      job.diagnostic = `result bundle rejected: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

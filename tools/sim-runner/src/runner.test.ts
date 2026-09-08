import {
  chmod,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import type { ExportedRunConfiguration } from "@linxsimcity/scenarios";

import { LocalSimulationRunner } from "./runner.js";
import { createRunnerServer } from "./server.js";

interface Harness {
  readonly baseUrl: string;
  readonly directory: string;
  readonly runner: LocalSimulationRunner;
  readonly close: () => Promise<void>;
}

const active: Harness[] = [];

afterEach(async () => {
  await Promise.all(active.splice(0).map((item) => item.close()));
});

async function harness(
  mode: "complete" | "wait" | "bad-manifest" | "bad-chunk" = "complete",
): Promise<Harness> {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "linxsimcity-runner-")),
  );
  const executable = join(directory, "fake-gfsim.mjs");
  const workload = join(directory, "matmul.elf");
  await writeFile(workload, "fake matmul ELF\n");
  const manifestConfigSha =
    mode === "bad-manifest" ? "0".repeat(64) : undefined;
  const fixture = fileURLToPath(
    new URL("../../../fixtures/current/minimal.bundle", import.meta.url),
  );
  const fakeSource =
    mode === "wait"
      ? `#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n`
      : `#!/usr/bin/env node
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
const args = process.argv.slice(2);
const settings = Object.fromEntries(args.slice(args.indexOf("-s") + 1).map((entry) => {
  const split = entry.indexOf("=");
  return [entry.slice(0, split), entry.slice(split + 1)];
}));
const output = settings["trace.linx_output"];
cpSync(${JSON.stringify(fixture)}, output, { recursive: true });
writeFileSync(join(dirname(import.meta.filename), "arguments.json"), JSON.stringify(args));
const manifestPath = join(output, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.runId = settings["trace.linx_run_id"];
manifest.simulator.name = "SuperScalarModel";
manifest.simulator.revision = settings["trace.linx_simulator_revision"];
manifest.simulator.configSha256 = ${manifestConfigSha ? JSON.stringify(manifestConfigSha) : 'settings["trace.linx_config_sha256"]'};
manifest.workload.name = settings["trace.linx_workload_name"];
manifest.workload.sha256 = settings["trace.linx_workload_sha256"];
writeFileSync(manifestPath, JSON.stringify(manifest));
const indexPath = join(output, "index.json");
const index = JSON.parse(readFileSync(indexPath, "utf8"));
index.runId = manifest.runId;
const checkpointEntry = index.checkpoints[0];
const checkpointPath = join(output, checkpointEntry.path);
const checkpoint = JSON.parse(gunzipSync(readFileSync(checkpointPath)).toString("utf8"));
checkpoint.runId = manifest.runId;
const checkpointBytes = gzipSync(Buffer.from(JSON.stringify(checkpoint)));
writeFileSync(checkpointPath, checkpointBytes);
checkpointEntry.compressedBytes = checkpointBytes.length;
checkpointEntry.sha256 = createHash("sha256").update(checkpointBytes).digest("hex");
writeFileSync(indexPath, JSON.stringify(index));
${mode === "bad-chunk" ? "const chunkPath = join(output, index.chunks[0].path); writeFileSync(chunkPath, gzipSync(gunzipSync(readFileSync(chunkPath)), { level: 1 }));" : ""}
`;
  await writeFile(executable, fakeSource);
  await chmod(executable, 0o755);
  const workloadSha256 = createHash("sha256")
    .update(await readFile(workload))
    .digest("hex");
  const runner = await LocalSimulationRunner.create({
    executablePath: executable,
    workingDirectory: directory,
    resultsDirectory: join(directory, "runs"),
    simulatorRevision: "2406db2944317b8d64dc05b621f37fc9a13f8c81",
    workloads: {
      "supernpubench-matmul-fp32-m256-n256-k256": {
        path: workload,
        sha256: workloadSha256,
      },
    },
  });
  const server = createRunnerServer(runner);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const item: Harness = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    directory,
    runner,
    close: async () => {
      await runner.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
  active.push(item);
  return item;
}

async function post(baseUrl: string, path: string, value: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

async function exportNormal(
  baseUrl: string,
): Promise<ExportedRunConfiguration> {
  const response = await post(baseUrl, "/configurations", {
    backendId: "superscalar-model",
    workloadId: "supernpubench-matmul-fp32-m256-n256-k256",
    scenarioId: "normal",
    parameters: {},
  });
  expect(response.status).toBe(200);
  return response.body as unknown as ExportedRunConfiguration;
}

async function waitForStatus(
  baseUrl: string,
  id: string,
  terminal: readonly string[],
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${baseUrl}/jobs/${id}`);
    const job = (await response.json()) as Record<string, unknown>;
    if (terminal.includes(job.status as string)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`job ${id} did not reach ${terminal.join(" or ")}`);
}

describe("local simulation runner service", () => {
  test("exposes only the current unprefixed catalog path", async () => {
    const testHarness = await harness();
    const current = await fetch(`${testHarness.baseUrl}/catalog`);
    expect(current.status).toBe(200);
    expect(await current.json()).toEqual(
      expect.objectContaining({
        backends: expect.any(Array),
        workloads: expect.any(Array),
        scenarios: expect.any(Array),
      }),
    );
    const removed = await fetch(`${testHarness.baseUrl}/v1/catalog`);
    expect(removed.status).toBe(404);
  });

  test("runs only the fixed executable and workload with typed -s overrides", async () => {
    const testHarness = await harness();
    const exported = await exportNormal(testHarness.baseUrl);
    const launched = await post(testHarness.baseUrl, "/jobs", exported);
    expect(launched.status).toBe(202);
    const id = launched.body.id as string;
    const job = await waitForStatus(testHarness.baseUrl, id, [
      "succeeded",
      "failed",
    ]);
    expect(job.status).toBe("succeeded");
    expect(job.result).toEqual(
      expect.objectContaining({
        bundlePath: join(testHarness.directory, "runs", `${id}.bundle`),
        manifest: expect.objectContaining({
          runId: id,
          configSha256: exported.configSha256,
        }),
      }),
    );

    const args = JSON.parse(
      await readFile(join(testHarness.directory, "arguments.json"), "utf8"),
    ) as string[];
    expect(args.slice(0, 3)).toEqual([
      "-f",
      join(testHarness.directory, "matmul.elf"),
      "-s",
    ]);
    expect(args).toContain("cell.perfect_mode=true");
    expect(args).toContain("cell.cube_max_bank_per_cycle=4");
    expect(args).toContain(`trace.linx_run_id=${id}`);
    expect(args.every((argument) => !argument.includes(";"))).toBe(true);
  });

  test.each([
    ["unknown parameter", { parameters: { command: "rm -rf /" } }],
    ["out-of-range parameter", { parameters: { cubeMaxBankPerCycle: 99 } }],
    ["path injection", { executablePath: "/bin/sh" }],
  ])("rejects %s before a process can start", async (_name, extra) => {
    const testHarness = await harness();
    const request = {
      backendId: "superscalar-model",
      workloadId: "supernpubench-matmul-fp32-m256-n256-k256",
      scenarioId: "normal",
      parameters: {},
      ...extra,
    };
    const response = await post(
      testHarness.baseUrl,
      "/configurations",
      request,
    );
    expect(response.status).toBe(400);
    expect(testHarness.runner.listJobs()).toHaveLength(0);
  });

  test("rejects a stale configuration hash", async () => {
    const testHarness = await harness();
    const exported = await exportNormal(testHarness.baseUrl);
    const response = await post(testHarness.baseUrl, "/jobs", {
      ...exported,
      configSha256: "0".repeat(64),
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/stale config hash/);
    expect(testHarness.runner.listJobs()).toHaveLength(0);
  });

  test("fails a completed job whose manifest binding is stale", async () => {
    const testHarness = await harness("bad-manifest");
    const exported = await exportNormal(testHarness.baseUrl);
    const launched = await post(testHarness.baseUrl, "/jobs", exported);
    const job = await waitForStatus(
      testHarness.baseUrl,
      launched.body.id as string,
      ["succeeded", "failed"],
    );
    expect(job.status).toBe("failed");
    expect(job.diagnostic).toMatch(/configSha256 binding mismatch/);
    expect(job.result).toBeUndefined();
  });

  test("fails a completed job with a corrupted indexed chunk", async () => {
    const testHarness = await harness("bad-chunk");
    const exported = await exportNormal(testHarness.baseUrl);
    const launched = await post(testHarness.baseUrl, "/jobs", exported);
    const job = await waitForStatus(
      testHarness.baseUrl,
      launched.body.id as string,
      ["succeeded", "failed"],
    );
    expect(job.status).toBe("failed");
    expect(job.diagnostic).toMatch(/simtrace bundle_(size|hash)/);
    expect(job.result).toBeUndefined();
  });

  test("reports status and cancels a running simulator", async () => {
    const testHarness = await harness("wait");
    const exported = await exportNormal(testHarness.baseUrl);
    const launched = await post(testHarness.baseUrl, "/jobs", exported);
    const id = launched.body.id as string;
    const running = await fetch(`${testHarness.baseUrl}/jobs/${id}`).then(
      (response) => response.json() as Promise<Record<string, unknown>>,
    );
    expect(running.status).toBe("running");
    const cancelling = await post(
      testHarness.baseUrl,
      `/jobs/${id}/cancel`,
      {},
    );
    expect(cancelling.status).toBe(202);
    expect(cancelling.body.status).toBe("cancelling");
    const cancelled = await waitForStatus(testHarness.baseUrl, id, [
      "cancelled",
    ]);
    expect(cancelled.status).toBe("cancelled");
  });
});

import type {
  BackendDefinition,
  ExportedRunConfiguration,
  ObservableRunMetrics,
  RunConfiguration,
  ScenarioDefinition,
  WorkloadDefinition,
} from "@linxsimcity/scenarios";

export const DEFAULT_RUNNER_BASE_URL = "http://127.0.0.1:4317";

export interface RunnerCatalog {
  readonly backends: readonly BackendDefinition[];
  readonly workloads: readonly WorkloadDefinition[];
  readonly scenarios: readonly ScenarioDefinition[];
}

export type RunnerJobStatus =
  "running" | "cancelling" | "succeeded" | "failed" | "cancelled";

export interface RunnerJobResult {
  readonly bundleBaseUrl: string;
  readonly manifest: {
    readonly runId: string;
    readonly topologyFingerprint: string;
    readonly simulatorRevision: string;
    readonly configSha256: string;
    readonly workloadName: string;
    readonly workloadSha256: string;
  };
  readonly metrics?: ObservableRunMetrics | undefined;
}

export interface RunnerJob {
  readonly id: string;
  readonly status: RunnerJobStatus;
  readonly configuration: RunConfiguration;
  readonly configSha256: string;
  readonly createdAt: string;
  readonly startedAt: string;
  readonly finishedAt?: string | undefined;
  readonly exitCode?: number | undefined;
  readonly diagnostic?: string | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly result?: RunnerJobResult | undefined;
}

type RunnerFetch = (input: string, init?: RequestInit) => Promise<Response>;

export class RunnerClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RunnerClientError";
  }
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RunnerClientError(`${path} is not an object`);
  }
  return value as Record<string, unknown>;
}

function job(value: unknown): RunnerJob {
  const source = object(value, "runner job");
  if (
    typeof source.id !== "string" ||
    !["running", "cancelling", "succeeded", "failed", "cancelled"].includes(
      String(source.status),
    ) ||
    typeof source.configSha256 !== "string"
  ) {
    throw new RunnerClientError("runner returned an invalid job");
  }
  return source as unknown as RunnerJob;
}

function boundedMessage(value: unknown): string {
  return String(value).replaceAll(/\s+/gu, " ").slice(0, 480);
}

export class RunnerClient {
  readonly baseUrl: string;

  constructor(
    baseUrl = DEFAULT_RUNNER_BASE_URL,
    private readonly runnerFetch: RunnerFetch = (input, init) =>
      globalThis.fetch(input, init),
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/u, "");
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.runnerFetch(`${this.baseUrl}${path}`, init);
    } catch (error) {
      throw new RunnerClientError(
        `无法连接本地 runner：${boundedMessage(error instanceof Error ? error.message : error)}`,
      );
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new RunnerClientError(
        `runner 返回了无效 JSON（HTTP ${response.status}）`,
        response.status,
      );
    }
    if (!response.ok) {
      const source = object(value, "runner error");
      throw new RunnerClientError(
        boundedMessage(source.error ?? `runner HTTP ${response.status}`),
        response.status,
      );
    }
    return value;
  }

  async catalog(): Promise<RunnerCatalog> {
    const value = object(await this.request("/catalog"), "runner catalog");
    if (
      !Array.isArray(value.backends) ||
      !Array.isArray(value.workloads) ||
      !Array.isArray(value.scenarios)
    ) {
      throw new RunnerClientError("runner returned an invalid catalog");
    }
    return value as unknown as RunnerCatalog;
  }

  async exportConfiguration(value: {
    readonly backendId: string;
    readonly workloadId: string;
    readonly scenarioId: string;
    readonly parameters: Readonly<Record<string, boolean | number | string>>;
  }): Promise<ExportedRunConfiguration> {
    const result = object(
      await this.request("/configurations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      }),
      "exported configuration",
    );
    if (
      typeof result.configSha256 !== "string" ||
      !Array.isArray(result.simulatorOverrides) ||
      !result.configuration
    ) {
      throw new RunnerClientError("runner returned an invalid configuration");
    }
    return result as unknown as ExportedRunConfiguration;
  }

  async startJob(configuration: ExportedRunConfiguration): Promise<RunnerJob> {
    return job(
      await this.request("/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(configuration),
      }),
    );
  }

  async getJob(jobId: string): Promise<RunnerJob> {
    return job(await this.request(`/jobs/${encodeURIComponent(jobId)}`));
  }

  async cancelJob(jobId: string): Promise<RunnerJob> {
    return job(
      await this.request(`/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: "POST",
      }),
    );
  }

  bundleBaseUrl(result: RunnerJobResult): string {
    return new URL(result.bundleBaseUrl, `${this.baseUrl}/`).href;
  }
}

export type LoadedRunFreshness = "empty" | "current" | "stale";

export function deriveLoadedRunFreshness(
  loadedConfigSha256: string | undefined,
  selectedConfigSha256: string | undefined,
): LoadedRunFreshness {
  if (!loadedConfigSha256) return "empty";
  return selectedConfigSha256 && selectedConfigSha256 !== loadedConfigSha256
    ? "stale"
    : "current";
}

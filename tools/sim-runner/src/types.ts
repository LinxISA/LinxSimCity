import type {
  ExportedRunConfiguration,
  RunConfiguration,
  WorkloadId,
} from "@linxsimcity/scenarios";

export type SimulationJobStatus =
  "running" | "cancelling" | "succeeded" | "failed" | "cancelled";

export interface RunnerWorkloadResource {
  readonly path: string;
  readonly sha256?: string | undefined;
}

export interface LocalRunnerOptions {
  readonly executablePath: string;
  readonly workingDirectory?: string | undefined;
  readonly resultsDirectory: string;
  readonly simulatorRevision: string;
  readonly workloads: Readonly<Record<WorkloadId, RunnerWorkloadResource>>;
}

export interface SimulationJobResult {
  readonly bundlePath: string;
  readonly manifest: {
    readonly runId: string;
    readonly topologyFingerprint: string;
    readonly simulatorRevision: string;
    readonly configSha256: string;
    readonly workloadName: string;
    readonly workloadSha256: string;
  };
}

export interface SimulationJob {
  readonly id: string;
  readonly status: SimulationJobStatus;
  readonly configuration: RunConfiguration;
  readonly configSha256: string;
  readonly simulatorArguments: readonly string[];
  readonly createdAt: string;
  readonly startedAt: string;
  readonly finishedAt?: string | undefined;
  readonly exitCode?: number | undefined;
  readonly diagnostic?: string | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly result?: SimulationJobResult | undefined;
}

export type StartSimulationRequest = ExportedRunConfiguration;

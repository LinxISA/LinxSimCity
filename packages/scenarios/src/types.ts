export const RUN_CONFIG_SCHEMA = "linxsimcity.run-config" as const;
export const RUN_CONFIG_VERSION = "1" as const;

export type BackendId = "superscalar-model";
export type WorkloadId = "supernpubench-matmul-fp32-m256-n256-k256";
export type ScenarioId = "normal" | "bank-conflict";
export type ScenarioParameterValue = boolean | number | string;

export interface BooleanParameterDefinition {
  readonly type: "boolean";
  readonly configKey: string;
  readonly label: string;
}

export interface IntegerParameterDefinition {
  readonly type: "integer";
  readonly configKey: string;
  readonly label: string;
  readonly minimum: number;
  readonly maximum: number;
}

export interface EnumParameterDefinition {
  readonly type: "enum";
  readonly configKey: string;
  readonly label: string;
  readonly values: readonly string[];
}

export type ScenarioParameterDefinition =
  | BooleanParameterDefinition
  | IntegerParameterDefinition
  | EnumParameterDefinition;

export interface BackendDefinition {
  readonly id: BackendId;
  readonly label: string;
  readonly executable: "gfsim";
}

export interface WorkloadDefinition {
  readonly id: WorkloadId;
  readonly label: string;
  readonly simulatorName: string;
  readonly defaultSha256: string;
}

export interface ScenarioDefinition {
  readonly id: ScenarioId;
  readonly label: string;
  readonly description: string;
  readonly backendId: BackendId;
  readonly workloadId: WorkloadId;
  readonly parameters: Readonly<Record<string, ScenarioParameterDefinition>>;
  readonly defaults: Readonly<Record<string, ScenarioParameterValue>>;
}

export interface RunConfiguration {
  readonly schema: typeof RUN_CONFIG_SCHEMA;
  readonly schemaVersion: typeof RUN_CONFIG_VERSION;
  readonly backendId: BackendId;
  readonly workloadId: WorkloadId;
  readonly scenarioId: ScenarioId;
  readonly parameters: Readonly<Record<string, ScenarioParameterValue>>;
}

export interface ExportedRunConfiguration {
  readonly configuration: RunConfiguration;
  readonly configSha256: string;
  readonly simulatorOverrides: readonly string[];
}

export type ChallengeId =
  "explain-topology" | "find-queue-bottleneck" | "reduce-bank-conflicts";

export type ObservableMetricId =
  | "cycles"
  | "queueBackpressureCycles"
  | "bankConflictCycles"
  | "waitCycles"
  | "tileTransferCount";

export interface ChallengeParameterRange {
  readonly parameter: string;
  readonly type: "boolean" | "integer";
  readonly minimum?: number;
  readonly maximum?: number;
  readonly values?: readonly boolean[];
}

export interface ChallengeCompletionRule {
  readonly kind: "evidence" | "positive-metrics" | "relative-improvement";
  readonly requiredMetrics: readonly ObservableMetricId[];
  readonly description: string;
  readonly minimumReductionPercent?: number;
  readonly mustReduceCycles?: boolean;
}

export interface ChallengeDefinition {
  readonly id: ChallengeId;
  readonly label: string;
  readonly objective: string;
  readonly backendId: BackendId;
  readonly workloadId: WorkloadId;
  readonly workloadSha256: string;
  readonly topologyFingerprint: string;
  readonly initialConfiguration: RunConfiguration;
  readonly allowedParameters: readonly ChallengeParameterRange[];
  readonly requiredTraceCapabilities: readonly string[];
  readonly steps: readonly string[];
  readonly observableMetrics: readonly ObservableMetricId[];
  readonly completion: ChallengeCompletionRule;
}

/** The current trace manifest fields used by challenge evaluation. */
export interface ChallengeRunManifest {
  readonly runId: string;
  readonly topologyFingerprint: string;
  readonly simulator: {
    readonly name: string;
    readonly configSha256: string;
  };
  readonly workload: {
    readonly name: string;
    readonly sha256: string;
  };
  readonly window: {
    readonly complete: boolean;
  };
  readonly capabilities: readonly string[];
  readonly loss: {
    readonly droppedEvents: string;
    readonly truncated: boolean;
  };
}

export interface ObservableRunMetrics {
  readonly schema: "linxsimcity.run-metrics";
  readonly schemaVersion: "1";
  readonly source:
    | "simulator-pmu"
    | "validated-trace-aggregate"
    | "validated-trace-and-simulator-pmu";
  readonly runId: string;
  readonly configSha256: string;
  readonly topologyFingerprint: string;
  readonly workloadSha256: string;
  readonly values: Partial<Readonly<Record<ObservableMetricId, string>>>;
}

export interface ChallengeRunEvidence {
  readonly configuration: RunConfiguration;
  readonly manifest: ChallengeRunManifest;
  readonly metrics?: ObservableRunMetrics;
}

export type ChallengeEvaluationStatus =
  | "complete"
  | "incomplete"
  | "insufficient-evidence"
  | "stale-run"
  | "incomparable-run"
  | "unsupported-run";

export interface ChallengeEvaluation {
  readonly challengeId: ChallengeId;
  readonly status: ChallengeEvaluationStatus;
  readonly diagnostics: readonly string[];
  readonly observed: Partial<Readonly<Record<ObservableMetricId, string>>>;
}

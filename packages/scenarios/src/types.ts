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

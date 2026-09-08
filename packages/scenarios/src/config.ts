import { createHash } from "node:crypto";

import { BACKENDS, SCENARIOS, WORKLOADS } from "./catalog.js";
import {
  RUN_CONFIG_SCHEMA,
  RUN_CONFIG_VERSION,
  type BackendId,
  type ExportedRunConfiguration,
  type RunConfiguration,
  type ScenarioDefinition,
  type ScenarioId,
  type ScenarioParameterDefinition,
  type ScenarioParameterValue,
  type WorkloadId,
} from "./types.js";

const IDENTIFIER = /^[a-z][a-z0-9-]*$/;

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${path}.${unknown} is not supported`);
}

function identifier(value: unknown, path: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new Error(`${path} must be an allowlisted identifier`);
  }
  return value;
}

function parameterValue(
  value: unknown,
  definition: ScenarioParameterDefinition,
  path: string,
): ScenarioParameterValue {
  if (definition.type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${path} must be boolean`);
    return value;
  }
  if (definition.type === "integer") {
    if (!Number.isSafeInteger(value))
      throw new Error(`${path} must be an integer`);
    const integer = value as number;
    if (integer < definition.minimum || integer > definition.maximum) {
      throw new Error(
        `${path} must be between ${definition.minimum} and ${definition.maximum}`,
      );
    }
    return integer;
  }
  if (typeof value !== "string" || !definition.values.includes(value)) {
    throw new Error(`${path} must be one of ${definition.values.join(", ")}`);
  }
  return value;
}

export function parseRunConfiguration(value: unknown): RunConfiguration {
  const source = record(value, "configuration");
  rejectUnknownKeys(
    source,
    [
      "schema",
      "schemaVersion",
      "backendId",
      "workloadId",
      "scenarioId",
      "parameters",
    ],
    "configuration",
  );
  if (source.schema !== RUN_CONFIG_SCHEMA) {
    throw new Error(`configuration.schema must be ${RUN_CONFIG_SCHEMA}`);
  }
  if (source.schemaVersion !== RUN_CONFIG_VERSION) {
    throw new Error(
      `configuration.schemaVersion must be ${RUN_CONFIG_VERSION}`,
    );
  }

  const backendId = identifier(source.backendId, "configuration.backendId");
  const workloadId = identifier(source.workloadId, "configuration.workloadId");
  const scenarioId = identifier(source.scenarioId, "configuration.scenarioId");
  const backend = BACKENDS[backendId as BackendId];
  const workload = WORKLOADS[workloadId as WorkloadId];
  const scenario = SCENARIOS[scenarioId as ScenarioId] as
    ScenarioDefinition | undefined;
  if (!backend) throw new Error(`unsupported backend: ${backendId}`);
  if (!workload) throw new Error(`unsupported workload: ${workloadId}`);
  if (!scenario) throw new Error(`unsupported scenario: ${scenarioId}`);
  if (
    scenario.backendId !== backend.id ||
    scenario.workloadId !== workload.id
  ) {
    throw new Error(
      "scenario does not support the selected backend and workload",
    );
  }

  const inputParameters = record(source.parameters, "configuration.parameters");
  rejectUnknownKeys(
    inputParameters,
    Object.keys(scenario.parameters),
    "configuration.parameters",
  );
  const parameters: Record<string, ScenarioParameterValue> = {};
  for (const key of Object.keys(scenario.parameters).sort()) {
    const definition = scenario.parameters[key]!;
    const input = Object.hasOwn(inputParameters, key)
      ? inputParameters[key]
      : scenario.defaults[key];
    parameters[key] = parameterValue(
      input,
      definition,
      `configuration.parameters.${key}`,
    );
  }

  return {
    schema: RUN_CONFIG_SCHEMA,
    schemaVersion: RUN_CONFIG_VERSION,
    backendId: backend.id,
    workloadId: workload.id,
    scenarioId: scenario.id,
    parameters,
  };
}

export function createRunConfiguration(value: {
  readonly backendId: BackendId;
  readonly workloadId: WorkloadId;
  readonly scenarioId: ScenarioId;
  readonly parameters?: Readonly<Record<string, unknown>>;
}): RunConfiguration {
  return parseRunConfiguration({
    schema: RUN_CONFIG_SCHEMA,
    schemaVersion: RUN_CONFIG_VERSION,
    ...value,
    parameters: value.parameters ?? {},
  });
}

export function canonicalRunConfiguration(
  configuration: RunConfiguration,
): string {
  const parsed = parseRunConfiguration(configuration);
  return `${JSON.stringify(parsed)}\n`;
}

export function hashRunConfiguration(configuration: RunConfiguration): string {
  return createHash("sha256")
    .update(canonicalRunConfiguration(configuration))
    .digest("hex");
}

function encodeConfigValue(value: ScenarioParameterValue): string {
  return typeof value === "boolean" ? String(value) : `${value}`;
}

export function exportRunConfiguration(
  value: unknown,
): ExportedRunConfiguration {
  const configuration = parseRunConfiguration(value);
  const scenario: ScenarioDefinition = SCENARIOS[configuration.scenarioId];
  const simulatorOverrides = Object.keys(scenario.parameters)
    .sort((left, right) =>
      scenario.parameters[left]!.configKey.localeCompare(
        scenario.parameters[right]!.configKey,
      ),
    )
    .map((key) => {
      const definition = scenario.parameters[key]!;
      return `${definition.configKey}=${encodeConfigValue(configuration.parameters[key]!)}`;
    });
  return {
    configuration,
    configSha256: hashRunConfiguration(configuration),
    simulatorOverrides,
  };
}

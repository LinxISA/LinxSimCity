import type { ArchitectureTopology, TopologyDiagnostic } from "./types.js";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(
  object: Record<string, unknown>,
  key: string,
  path: string,
  diagnostics: TopologyDiagnostic[],
): void {
  if (!(key in object)) {
    diagnostics.push({
      path: `${path}.${key}`,
      code: "missing_field",
      message: `${key} is required`,
    });
  } else if (typeof object[key] !== "string" || object[key] === "") {
    diagnostics.push({
      path: `${path}.${key}`,
      code: "invalid_type",
      message: `${key} must be a non-empty string`,
    });
  }
}

function typedRecord(
  value: unknown,
  path: string,
  diagnostics: TopologyDiagnostic[],
  allowed: readonly string[],
): void {
  if (!record(value)) {
    diagnostics.push({
      path,
      code: "invalid_type",
      message: "must be an object",
    });
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (
      !allowed.includes(typeof item) ||
      (typeof item === "number" && !Number.isFinite(item))
    ) {
      diagnostics.push({
        path: `${path}.${key}`,
        code: "invalid_type",
        message: `must be ${allowed.join(", ")}`,
      });
    }
  }
}

function validateArea(
  value: unknown,
  path: string,
  diagnostics: TopologyDiagnostic[],
): void {
  if (!record(value)) {
    diagnostics.push({
      path,
      code: "invalid_type",
      message: "area must be an object",
    });
    return;
  }
  if (
    value.value !== null &&
    (typeof value.value !== "number" || !Number.isFinite(value.value))
  ) {
    diagnostics.push({
      path: `${path}.value`,
      code: "invalid_type",
      message: "area value must be a finite number or null",
    });
  }
  requiredString(value, "unit", path, diagnostics);
  requiredString(value, "status", path, diagnostics);
  requiredString(value, "source", path, diagnostics);
}

function validateEndpoint(
  value: unknown,
  path: string,
  diagnostics: TopologyDiagnostic[],
): void {
  if (!record(value)) {
    diagnostics.push({
      path,
      code: "invalid_type",
      message: "endpoint must be an object",
    });
    return;
  }
  requiredString(value, "nodeId", path, diagnostics);
  requiredString(value, "portId", path, diagnostics);
}

function validateSource(
  value: unknown,
  diagnostics: TopologyDiagnostic[],
): void {
  const path = "source";
  if (!record(value)) {
    diagnostics.push({
      path,
      code: "invalid_type",
      message: "source must be an object",
    });
    return;
  }
  for (const key of [
    "kind",
    "repository",
    "revision",
    "planSchema",
    "planVersion",
    "planSha256",
    "modelSha256",
  ]) {
    requiredString(value, key, path, diagnostics);
  }
  for (const key of ["worktreeDirty", "relevantInputsDirty"]) {
    if (typeof value[key] !== "boolean") {
      diagnostics.push({
        path: `${path}.${key}`,
        code: key in value ? "invalid_type" : "missing_field",
        message: `${key} must be a boolean`,
      });
    }
  }
}

export function validateTopologySchema(
  value: unknown,
): readonly TopologyDiagnostic[] {
  const diagnostics: TopologyDiagnostic[] = [];
  if (!record(value)) {
    return [
      {
        path: "$",
        code: "invalid_type",
        message: "topology must be an object",
      },
    ];
  }
  if (value.schema !== "linxsimcity.topology") {
    diagnostics.push({
      path: "schema",
      code: "invalid_schema",
      message: 'schema must be "linxsimcity.topology"',
    });
  }
  if (value.schemaVersion !== "1") {
    diagnostics.push({
      path: "schemaVersion",
      code: "invalid_schema",
      message: 'schemaVersion must be "1"',
    });
  }
  for (const key of ["id", "name", "revision"]) {
    requiredString(value, key, "$", diagnostics);
  }
  if (value.source !== undefined) validateSource(value.source, diagnostics);
  if (!Array.isArray(value.nodes)) {
    diagnostics.push({
      path: "nodes",
      code: "invalid_type",
      message: "nodes must be an array",
    });
  } else {
    value.nodes.forEach((node, index) => {
      const path = `nodes[${index}]`;
      if (!record(node)) {
        diagnostics.push({
          path,
          code: "invalid_type",
          message: "node must be an object",
        });
        return;
      }
      requiredString(node, "id", path, diagnostics);
      requiredString(node, "definitionId", path, diagnostics);
      if (node.label !== undefined && typeof node.label !== "string") {
        diagnostics.push({
          path: `${path}.label`,
          code: "invalid_type",
          message: "label must be a string",
        });
      }
      if (node.parentId !== undefined && typeof node.parentId !== "string") {
        diagnostics.push({
          path: `${path}.parentId`,
          code: "invalid_type",
          message: "parentId must be a string",
        });
      }
      typedRecord(node.parameters, `${path}.parameters`, diagnostics, [
        "number",
      ]);
      if (node.attributes !== undefined) {
        typedRecord(node.attributes, `${path}.attributes`, diagnostics, [
          "string",
          "number",
          "boolean",
        ]);
      }
      validateArea(node.area, `${path}.area`, diagnostics);
    });
  }
  if (!Array.isArray(value.edges)) {
    diagnostics.push({
      path: "edges",
      code: "invalid_type",
      message: "edges must be an array",
    });
  } else {
    value.edges.forEach((edge, index) => {
      const path = `edges[${index}]`;
      if (!record(edge)) {
        diagnostics.push({
          path,
          code: "invalid_type",
          message: "edge must be an object",
        });
        return;
      }
      requiredString(edge, "id", path, diagnostics);
      validateEndpoint(edge.from, `${path}.from`, diagnostics);
      validateEndpoint(edge.to, `${path}.to`, diagnostics);
    });
  }
  return diagnostics;
}

export class TopologySchemaError extends Error {
  readonly diagnostics: readonly TopologyDiagnostic[];

  constructor(diagnostics: readonly TopologyDiagnostic[]) {
    const first = diagnostics[0];
    super(
      first ? `${first.path}: ${first.message}` : "invalid topology schema",
    );
    this.name = "TopologySchemaError";
    this.diagnostics = diagnostics;
  }
}

export function parseArchitectureTopology(
  value: unknown,
): ArchitectureTopology {
  const diagnostics = validateTopologySchema(value);
  if (diagnostics.length > 0) throw new TopologySchemaError(diagnostics);
  return value as ArchitectureTopology;
}

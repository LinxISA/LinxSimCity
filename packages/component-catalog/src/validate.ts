import { BRICK_KINDS, PORT_PROTOCOLS } from "./types.js";
import type {
  BrickDefinition,
  CatalogDiagnostic,
  ComponentCatalog,
} from "./types.js";

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function validateDefinition(
  definition: BrickDefinition,
  path = "definition",
): CatalogDiagnostic[] {
  const diagnostics: CatalogDiagnostic[] = [];
  if (!ID_PATTERN.test(definition.id)) {
    diagnostics.push({
      path: `${path}.id`,
      message: "must be a stable lowercase ID",
    });
  }
  if (!BRICK_KINDS.includes(definition.kind)) {
    diagnostics.push({
      path: `${path}.kind`,
      message: "is not a supported brick kind",
    });
  }
  for (const axis of ["x", "y", "z"] as const) {
    if (!Number.isFinite(definition.size[axis]) || definition.size[axis] <= 0) {
      diagnostics.push({
        path: `${path}.size.${axis}`,
        message: "must be positive and finite",
      });
    }
  }
  const portIds = new Set<string>();
  definition.ports.forEach((item, index) => {
    const portPath = `${path}.ports[${index}]`;
    if (portIds.has(item.id)) {
      diagnostics.push({
        path: `${portPath}.id`,
        message: "duplicates another port ID",
      });
    }
    portIds.add(item.id);
    if (!PORT_PROTOCOLS.includes(item.protocol)) {
      diagnostics.push({
        path: `${portPath}.protocol`,
        message: "is unsupported",
      });
    }
    if (item.widthBits !== null && !positiveInteger(item.widthBits)) {
      diagnostics.push({
        path: `${portPath}.widthBits`,
        message: "must be a positive safe integer",
      });
    }
    if (!["one", "many"].includes(item.cardinality)) {
      diagnostics.push({
        path: `${portPath}.cardinality`,
        message: "must be one or many",
      });
    }
    if (item.anchor.some((value) => !Number.isFinite(value))) {
      diagnostics.push({
        path: `${portPath}.anchor`,
        message: "must contain finite coordinates",
      });
    }
  });
  for (const [parameterId, parameter] of Object.entries(
    definition.parameters,
  )) {
    const parameterPath = `${path}.parameters.${parameterId}`;
    if (
      !Number.isSafeInteger(parameter.default) ||
      !Number.isSafeInteger(parameter.minimum) ||
      !Number.isSafeInteger(parameter.maximum) ||
      !positiveInteger(parameter.step) ||
      parameter.minimum > parameter.default ||
      parameter.default > parameter.maximum
    ) {
      diagnostics.push({
        path: parameterPath,
        message: "has an invalid integer range",
      });
    }
  }
  return diagnostics;
}

export function validateCatalog(
  catalog: ComponentCatalog,
): CatalogDiagnostic[] {
  const diagnostics: CatalogDiagnostic[] = [];
  const ids = new Set<string>();
  catalog.definitions.forEach((definition, index) => {
    const path = `definitions[${index}]`;
    if (ids.has(definition.id)) {
      diagnostics.push({
        path: `${path}.id`,
        message: "duplicates another definition ID",
      });
    }
    ids.add(definition.id);
    diagnostics.push(...validateDefinition(definition, path));
  });
  return diagnostics;
}

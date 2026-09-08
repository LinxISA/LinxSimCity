import type {
  BrickDefinition,
  ComponentCatalog,
} from "@linxsimcity/component-catalog";

import { axisToNumber, worldPosition } from "./coordinates.js";
import type {
  Blueprint,
  BlueprintDiagnostic,
  BrickInstance,
  LinkEndpoint,
} from "./types.js";

const INSTANCE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

export function createInstance(
  id: string,
  definition: BrickDefinition,
  position: readonly [number, number, number],
): BrickInstance {
  return {
    id,
    definitionId: definition.id,
    transform: { position: worldPosition(...position), yawQuarterTurns: 0 },
    parameters: Object.fromEntries(
      Object.entries(definition.parameters).map(([key, parameter]) => [
        key,
        parameter.default,
      ]),
    ),
  };
}

export function emptyBlueprint(
  id = "workspace",
  name = "Untitled chip",
): Blueprint {
  return {
    schema: "linxsimcity.blueprint",
    schemaVersion: "1",
    id,
    name,
    revision: 0,
    instances: [],
    links: [],
  };
}

function endpoint(
  value: LinkEndpoint,
  instanceById: ReadonlyMap<string, BrickInstance>,
  definitionById: ReadonlyMap<string, BrickDefinition>,
):
  | { instance: BrickInstance; definition: BrickDefinition; portIndex: number }
  | undefined {
  const instance = instanceById.get(value.instanceId);
  if (!instance) return undefined;
  const definition = definitionById.get(instance.definitionId);
  if (!definition) return undefined;
  const portIndex = definition.ports.findIndex(
    (port) => port.id === value.portId,
  );
  if (portIndex < 0) return undefined;
  return { instance, definition, portIndex };
}

export function validateBlueprint(
  blueprint: Blueprint,
  catalog: ComponentCatalog,
): BlueprintDiagnostic[] {
  const diagnostics: BlueprintDiagnostic[] = [];
  const definitionById = new Map(
    catalog.definitions.map((item) => [item.id, item]),
  );
  const instanceById = new Map<string, BrickInstance>();
  blueprint.instances.forEach((instance, index) => {
    const path = `instances[${index}]`;
    if (!INSTANCE_ID.test(instance.id) || instanceById.has(instance.id)) {
      diagnostics.push({
        path: `${path}.id`,
        code: "duplicate_id",
        message: "instance ID is invalid or duplicated",
      });
    }
    instanceById.set(instance.id, instance);
    const definition = definitionById.get(instance.definitionId);
    if (!definition) {
      diagnostics.push({
        path: `${path}.definitionId`,
        code: "missing_definition",
        message: `definition ${instance.definitionId} does not exist`,
      });
      return;
    }
    for (const axis of ["x", "y", "z"] as const) {
      const axisValue = instance.transform.position[axis];
      if (
        !Number.isSafeInteger(axisValue.chunk) ||
        !Number.isSafeInteger(axisValue.local) ||
        axisValue.local < 0 ||
        axisValue.local >= 64 ||
        !Number.isSafeInteger(axisToNumber(axisValue))
      ) {
        diagnostics.push({
          path: `${path}.transform.position.${axis}`,
          code: "invalid_position",
          message: "position is not normalized or exceeds the safe range",
        });
      }
    }
    for (const [parameterId, value] of Object.entries(instance.parameters)) {
      const parameter = definition.parameters[parameterId];
      if (
        !parameter ||
        !Number.isSafeInteger(value) ||
        value < parameter.minimum ||
        value > parameter.maximum ||
        (value - parameter.minimum) % parameter.step !== 0
      ) {
        diagnostics.push({
          path: `${path}.parameters.${parameterId}`,
          code: "invalid_parameter",
          message:
            "parameter is missing from the definition or outside its integer range",
        });
      }
    }
  });

  const linkIds = new Set<string>();
  const occupiedInputs = new Set<string>();
  blueprint.links.forEach((link, index) => {
    const path = `links[${index}]`;
    if (linkIds.has(link.id)) {
      diagnostics.push({
        path: `${path}.id`,
        code: "duplicate_id",
        message: "link ID is duplicated",
      });
    }
    linkIds.add(link.id);
    const from = endpoint(link.from, instanceById, definitionById);
    const to = endpoint(link.to, instanceById, definitionById);
    if (!from || !to) {
      const missingInstance =
        !instanceById.has(link.from.instanceId) ||
        !instanceById.has(link.to.instanceId);
      diagnostics.push({
        path,
        code: missingInstance ? "missing_endpoint" : "missing_port",
        message: "link endpoint or port does not exist",
      });
      return;
    }
    const fromPort = from.definition.ports[from.portIndex]!;
    const toPort = to.definition.ports[to.portIndex]!;
    if (
      !["output", "bidirectional"].includes(fromPort.direction) ||
      !["input", "bidirectional"].includes(toPort.direction)
    ) {
      diagnostics.push({
        path,
        code: "invalid_direction",
        message: "links must run from an output to an input",
      });
    }
    if (fromPort.protocol !== toPort.protocol) {
      diagnostics.push({
        path,
        code: "protocol_mismatch",
        message: `${fromPort.protocol} cannot connect to ${toPort.protocol}`,
      });
    }
    if (fromPort.widthBits !== toPort.widthBits) {
      diagnostics.push({
        path,
        code: "width_mismatch",
        message: `${fromPort.widthBits}-bit output cannot connect to ${toPort.widthBits}-bit input`,
      });
    }
    const inputKey = `${link.to.instanceId}.${link.to.portId}`;
    if (occupiedInputs.has(inputKey)) {
      diagnostics.push({
        path,
        code: "input_already_connected",
        message: "input already has a producer",
      });
    }
    occupiedInputs.add(inputKey);
  });
  return diagnostics;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(",")}}`;
}

export function blueprintFingerprint(blueprint: Blueprint): string {
  const hardware = {
    schema: blueprint.schema,
    schemaVersion: blueprint.schemaVersion,
    instances: [...blueprint.instances]
      .map(({ id, definitionId, parameters }) => ({
        id,
        definitionId,
        parameters,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    links: [...blueprint.links]
      .map(({ id, from, to }) => ({ id, from, to }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(stable(hardware))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

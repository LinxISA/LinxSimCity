import type {
  BrickDefinition,
  ComponentCatalog,
} from "@linxsimcity/component-catalog";

import { worldPosition } from "./coordinates.js";
import type {
  ArchitectureTopology,
  BrickInstance,
  GeneratedWorld,
  TopologyDiagnostic,
  TopologyEndpoint,
  TopologyNode,
} from "./types.js";

const STABLE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(",")}}`;
}

export function topologyFingerprint(topology: ArchitectureTopology): string {
  const normalized = {
    schema: topology.schema,
    schemaVersion: topology.schemaVersion,
    id: topology.id,
    revision: topology.revision,
    nodes: [...topology.nodes]
      .map(({ id, definitionId, parentId, parameters }) => ({
        id,
        definitionId,
        ...(parentId ? { parentId } : {}),
        parameters,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...topology.edges]
      .map(({ id, from, to }) => ({ id, from, to }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(stable(normalized))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function findEndpoint(
  endpoint: TopologyEndpoint,
  nodeById: ReadonlyMap<string, TopologyNode>,
  definitionById: ReadonlyMap<string, BrickDefinition>,
):
  | { node: TopologyNode; definition: BrickDefinition; portIndex: number }
  | undefined {
  const node = nodeById.get(endpoint.nodeId);
  if (!node) return undefined;
  const definition = definitionById.get(node.definitionId);
  if (!definition) return undefined;
  const portIndex = definition.ports.findIndex(
    (port) => port.id === endpoint.portId,
  );
  if (portIndex < 0) return undefined;
  return { node, definition, portIndex };
}

export function validateArchitectureTopology(
  topology: ArchitectureTopology,
  catalog: ComponentCatalog,
): TopologyDiagnostic[] {
  const diagnostics: TopologyDiagnostic[] = [];
  const definitionById = new Map(
    catalog.definitions.map((item) => [item.id, item]),
  );
  const nodeById = new Map<string, TopologyNode>();

  topology.nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;
    if (!STABLE_ID.test(node.id) || nodeById.has(node.id)) {
      diagnostics.push({
        path: `${path}.id`,
        code: "duplicate_id",
        message: "node ID is invalid or duplicated",
      });
    }
    nodeById.set(node.id, node);
    const definition = definitionById.get(node.definitionId);
    if (!definition) {
      diagnostics.push({
        path: `${path}.definitionId`,
        code: "missing_definition",
        message: `definition ${node.definitionId} does not exist`,
      });
      return;
    }
    for (const [parameterId, value] of Object.entries(node.parameters)) {
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

  topology.nodes.forEach((node, index) => {
    if (node.parentId && !nodeById.has(node.parentId)) {
      diagnostics.push({
        path: `nodes[${index}].parentId`,
        code: "invalid_parent",
        message: `parent ${node.parentId} does not exist`,
      });
    }
  });

  const edgeIds = new Set<string>();
  const occupiedInputs = new Set<string>();
  topology.edges.forEach((edge, index) => {
    const path = `edges[${index}]`;
    if (!STABLE_ID.test(edge.id) || edgeIds.has(edge.id)) {
      diagnostics.push({
        path: `${path}.id`,
        code: "duplicate_id",
        message: "edge ID is invalid or duplicated",
      });
    }
    edgeIds.add(edge.id);
    const from = findEndpoint(edge.from, nodeById, definitionById);
    const to = findEndpoint(edge.to, nodeById, definitionById);
    if (!from || !to) {
      const missingNode =
        !nodeById.has(edge.from.nodeId) || !nodeById.has(edge.to.nodeId);
      diagnostics.push({
        path,
        code: missingNode ? "missing_endpoint" : "missing_port",
        message: "edge endpoint or port does not exist",
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
        message: "edges must run from an output to an input",
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
    const inputKey = `${edge.to.nodeId}.${edge.to.portId}`;
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

function defaultParameters(
  definition: BrickDefinition,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(definition.parameters).map(([key, parameter]) => [
      key,
      parameter.default,
    ]),
  );
}

function calculateLayers(topology: ArchitectureTopology): Map<string, number> {
  const incoming = new Map(topology.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of topology.edges) {
    incoming.set(edge.to.nodeId, (incoming.get(edge.to.nodeId) ?? 0) + 1);
    const targets = outgoing.get(edge.from.nodeId) ?? [];
    targets.push(edge.to.nodeId);
    outgoing.set(edge.from.nodeId, targets);
  }
  const queue = topology.nodes
    .filter((node) => incoming.get(node.id) === 0)
    .map((node) => node.id);
  const layer = new Map(topology.nodes.map((node) => [node.id, 0]));
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const nodeId = queue[cursor]!;
    for (const target of outgoing.get(nodeId) ?? []) {
      layer.set(
        target,
        Math.max(layer.get(target) ?? 0, (layer.get(nodeId) ?? 0) + 1),
      );
      const remaining = (incoming.get(target) ?? 1) - 1;
      incoming.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }
  const resolved = new Set(queue);
  let cycleLayer = Math.max(0, ...layer.values()) + 1;
  for (const node of topology.nodes) {
    if (!resolved.has(node.id)) {
      layer.set(node.id, cycleLayer);
      cycleLayer += 1;
    }
  }
  return layer;
}

export function generateWorldFromTopology(
  topology: ArchitectureTopology,
  catalog: ComponentCatalog,
): GeneratedWorld {
  const diagnostics = validateArchitectureTopology(topology, catalog);
  if (diagnostics.length > 0) {
    throw new Error(`${diagnostics[0]!.path}: ${diagnostics[0]!.message}`);
  }
  const definitionById = new Map(
    catalog.definitions.map((item) => [item.id, item]),
  );
  const layers = calculateLayers(topology);
  const byLayer = new Map<number, TopologyNode[]>();
  for (const node of topology.nodes) {
    const nodeLayer = layers.get(node.id) ?? 0;
    const values = byLayer.get(nodeLayer) ?? [];
    values.push(node);
    byLayer.set(nodeLayer, values);
  }
  const instances: BrickInstance[] = [];
  for (const [nodeLayer, nodes] of [...byLayer].sort(
    ([left], [right]) => left - right,
  )) {
    nodes.sort((left, right) => left.id.localeCompare(right.id));
    const totalDepth = nodes.reduce((sum, node) => {
      const definition = definitionById.get(node.definitionId)!;
      return sum + definition.size.z + 4;
    }, 0);
    let z = -totalDepth / 2;
    for (const node of nodes) {
      const definition = definitionById.get(node.definitionId)!;
      z += definition.size.z / 2 + 2;
      instances.push({
        id: node.id,
        definitionId: node.definitionId,
        ...(node.label ? { label: node.label } : {}),
        transform: {
          position: worldPosition(nodeLayer * 13 - 13, 0, Math.round(z)),
          yawQuarterTurns: 0,
        },
        parameters: {
          ...defaultParameters(definition),
          ...node.parameters,
        },
      });
      z += definition.size.z / 2 + 2;
    }
  }
  return {
    schema: "linxsimcity.generated-world",
    schemaVersion: "1",
    topologyId: topology.id,
    topologyRevision: topology.revision,
    topologyFingerprint: topologyFingerprint(topology),
    name: topology.name,
    instances,
    links: topology.edges.map((edge) => ({
      id: edge.id,
      from: { instanceId: edge.from.nodeId, portId: edge.from.portId },
      to: { instanceId: edge.to.nodeId, portId: edge.to.portId },
    })),
  };
}

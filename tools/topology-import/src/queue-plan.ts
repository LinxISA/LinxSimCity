import { CORE_CATALOG } from "@linxsimcity/component-catalog";
import type { BrickDefinition } from "@linxsimcity/component-catalog";
import type { ArchitectureTopology, TopologyNode } from "@linxsimcity/world";
import { validateArchitectureTopology } from "@linxsimcity/world";

import type {
  AgenticQueuePlan,
  QueuePlanBlock,
  QueuePlanProvenance,
  QueuePlanQueue,
} from "./types.js";

const SUPPORTED_BLOCK_DEFINITIONS: Readonly<Record<string, string>> = {
  source: "ac.source",
  transform: "ac.transform",
  dependency: "ac.dependency",
  route: "ac.route",
  merge: "ac.merge",
  reorder: "ac.reorder",
  observe: "ac.observe",
  sink: "ac.sink",
};

const UNKNOWN_QUEUE_PLAN_AREA = {
  value: null,
  unit: "um2",
  status: "unknown",
  source: "agentic-circuit-queue-plan:no-physical-area",
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be a string array`);
  }
  return value;
}

function safeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value))
    throw new Error(`${field} must be a safe integer`);
  return value as number;
}

function integerArray(value: unknown, field: string): readonly number[] {
  if (!Array.isArray(value))
    throw new Error(`${field} must be an integer array`);
  return value.map((item, index) => safeInteger(item, `${field}[${index}]`));
}

function parseQueue(value: unknown, index: number): QueuePlanQueue {
  if (!record(value)) throw new Error(`queues[${index}] must be an object`);
  const name = value.name;
  const scope = value.scope;
  const payloadType = value.payload_type;
  if (
    typeof name !== "string" ||
    typeof scope !== "string" ||
    typeof payloadType !== "string"
  ) {
    throw new Error(`queues[${index}] has invalid identity fields`);
  }
  return {
    name,
    scope,
    payload_type: payloadType,
    depth: safeInteger(value.depth, `queues[${index}].depth`),
    latency: safeInteger(value.latency, `queues[${index}].latency`),
    rate: safeInteger(value.rate, `queues[${index}].rate`),
  };
}

function parseBlock(value: unknown, index: number): QueuePlanBlock {
  if (!record(value)) throw new Error(`blocks[${index}] must be an object`);
  const name = value.name;
  const kind = value.kind;
  const scope = value.scope;
  if (
    typeof name !== "string" ||
    typeof kind !== "string" ||
    typeof scope !== "string"
  ) {
    throw new Error(`blocks[${index}] has invalid identity fields`);
  }
  return {
    name,
    kind,
    scope,
    lexical_order: safeInteger(
      value.lexical_order,
      `blocks[${index}].lexical_order`,
    ),
    inputs: stringArray(value.inputs, `blocks[${index}].inputs`),
    outputs: stringArray(value.outputs, `blocks[${index}].outputs`),
    capacity: safeInteger(value.capacity, `blocks[${index}].capacity`),
    resources: safeInteger(value.resources, `blocks[${index}].resources`),
    latencies: integerArray(value.latencies, `blocks[${index}].latencies`),
  };
}

export function parseAgenticQueuePlan(value: unknown): AgenticQueuePlan {
  if (!record(value)) throw new Error("queue plan must be an object");
  if (value.schema !== "agentic-circuit-queue-graph-plan") {
    throw new Error("unsupported queue plan schema");
  }
  if (value.version !== "0.5" || value.contract_epoch !== "0.5") {
    throw new Error("unsupported QueueGraph plan version or contract epoch");
  }
  if (
    typeof value.version !== "string" ||
    typeof value.contract_epoch !== "string" ||
    typeof value.system !== "string"
  ) {
    throw new Error(
      "queue plan version, contract_epoch, and system are required",
    );
  }
  const scopes = stringArray(value.scopes, "scopes");
  if (!Array.isArray(value.queues) || !Array.isArray(value.blocks)) {
    throw new Error("queue plan queues and blocks must be arrays");
  }
  return {
    schema: value.schema,
    version: value.version,
    contract_epoch: value.contract_epoch,
    system: value.system,
    scopes,
    queues: value.queues.map(parseQueue),
    blocks: value.blocks.map(parseBlock),
  };
}

function slug(value: string): string {
  const result = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return result || "root";
}

function ordinal(value: number): string {
  return String(value).padStart(3, "0");
}

function scopeId(scope: string): string {
  return scope === "/" ? "scope.root" : `scope.${slug(scope)}`;
}

function definitionForBlock(block: QueuePlanBlock): string {
  const definition = SUPPORTED_BLOCK_DEFINITIONS[block.kind];
  if (!definition)
    throw new Error(`unsupported QueueGraph block kind ${block.kind}`);
  return definition;
}

function parametersForBlock(
  block: QueuePlanBlock,
): Readonly<Record<string, number>> {
  switch (block.kind) {
    case "transform":
      return { latency: block.latencies[0] ?? 1 };
    case "dependency":
      return { capacity: block.capacity, resources: block.resources };
    case "route":
      return { outputs: block.outputs.length };
    case "merge":
      return { inputs: block.inputs.length };
    case "reorder":
      return { capacity: block.capacity };
    default:
      return {};
  }
}

function queueNode(queue: QueuePlanQueue, index: number): TopologyNode {
  return {
    id: `queue.q${ordinal(index)}.${slug(queue.name)}`,
    definitionId: "core.queue",
    label: queue.name,
    parentId: scopeId(queue.scope),
    parameters: { capacity: queue.depth, latency: queue.latency },
    area: UNKNOWN_QUEUE_PLAN_AREA,
    attributes: {
      sourceKind: "queue",
      sourceName: queue.name,
      scope: queue.scope,
      payloadType: queue.payload_type,
      rate: queue.rate,
    },
  };
}

function blockNode(block: QueuePlanBlock): TopologyNode {
  return {
    id: `block.b${ordinal(block.lexical_order)}.${slug(block.name)}`,
    definitionId: definitionForBlock(block),
    label: block.name,
    parentId: scopeId(block.scope),
    parameters: parametersForBlock(block),
    area: UNKNOWN_QUEUE_PLAN_AREA,
    attributes: {
      sourceKind: "block",
      blockKind: block.kind,
      scope: block.scope,
      lexicalOrder: block.lexical_order,
      inputCount: block.inputs.length,
      outputCount: block.outputs.length,
    },
  };
}

export function convertAgenticQueuePlan(
  plan: AgenticQueuePlan,
  provenance: QueuePlanProvenance,
): ArchitectureTopology {
  const scopePaths = ["/", ...plan.scopes].filter(
    (scope, index, values) => values.indexOf(scope) === index,
  );
  const scopeNodes: TopologyNode[] = scopePaths.map((scope) => {
    const parts = scope.split("/").filter(Boolean);
    const parentPath =
      parts.length <= 1 ? "/" : `/${parts.slice(0, -1).join("/")}`;
    return {
      id: scopeId(scope),
      definitionId: "core.container",
      label: scope === "/" ? plan.system : parts.at(-1)!,
      ...(scope === "/" ? {} : { parentId: scopeId(parentPath) }),
      parameters: {},
      area: {
        value: null,
        unit: "um2",
        status: "aggregate",
        source: "linxsimcity:children-have-unknown-area",
      },
      attributes: { sourceKind: "scope", scope },
    };
  });
  const blockNodes = plan.blocks.map(blockNode);
  const queueNodes = plan.queues.map(queueNode);
  const blockIdByOutput = new Map<string, string>();
  plan.blocks.forEach((block) => {
    const blockId = blockNode(block).id;
    block.outputs.forEach((output) => {
      if (blockIdByOutput.has(output)) {
        throw new Error(`queue ${output} has multiple producer blocks`);
      }
      blockIdByOutput.set(output, blockId);
    });
  });
  const queueIdByName = new Map<string, string>();
  plan.queues.forEach((queue, index) => {
    if (queueIdByName.has(queue.name)) {
      throw new Error(`queue name ${queue.name} is duplicated`);
    }
    queueIdByName.set(queue.name, queueNode(queue, index).id);
  });
  let edgeIndex = 0;
  const edges: ArchitectureTopology["edges"][number][] = [];
  plan.queues.forEach((queue) => {
    const queueId = queueIdByName.get(queue.name)!;
    const producerId = blockIdByOutput.get(queue.name);
    if (!producerId)
      throw new Error(`queue ${queue.name} has no producer block`);
    edges.push({
      id: `edge.e${ordinal(edgeIndex)}.${slug(queue.name)}.produce`,
      from: { nodeId: producerId, portId: "out" },
      to: { nodeId: queueId, portId: "in" },
    });
    edgeIndex += 1;
    plan.blocks.forEach((block) => {
      if (!block.inputs.includes(queue.name)) return;
      edges.push({
        id: `edge.e${ordinal(edgeIndex)}.${slug(queue.name)}.consume.b${ordinal(block.lexical_order)}`,
        from: { nodeId: queueId, portId: "out" },
        to: { nodeId: blockNode(block).id, portId: "in" },
      });
      edgeIndex += 1;
    });
  });
  const topology: ArchitectureTopology = {
    schema: "linxsimcity.topology",
    schemaVersion: "1",
    id: `agentic.${slug(plan.system)}`,
    name: `${plan.system} QueueGraph`,
    revision: `${provenance.revision}:${provenance.planSha256.slice(0, 12)}`,
    source: {
      kind: "agentic-circuit-queue-graph-plan",
      repository: provenance.repository,
      revision: provenance.revision,
      worktreeDirty: provenance.worktreeDirty,
      relevantInputsDirty: provenance.relevantInputsDirty,
      planSchema: plan.schema,
      planVersion: plan.version,
      planSha256: provenance.planSha256,
      modelSha256: provenance.modelSha256,
    },
    nodes: [...scopeNodes, ...blockNodes, ...queueNodes],
    edges,
  };
  const diagnostics = validateArchitectureTopology(topology, CORE_CATALOG);
  if (diagnostics.length > 0) {
    throw new Error(`${diagnostics[0]!.path}: ${diagnostics[0]!.message}`);
  }
  return topology;
}

export function definitionForQueuePlanBlockKind(
  kind: string,
): BrickDefinition | undefined {
  const id = SUPPORTED_BLOCK_DEFINITIONS[kind];
  return id
    ? CORE_CATALOG.definitions.find((definition) => definition.id === id)
    : undefined;
}

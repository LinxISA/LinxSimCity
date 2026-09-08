import type {
  BrickDefinition,
  BrickSize,
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
      .map(({ id, definitionId, parentId, parameters, attributes, area }) => ({
        id,
        definitionId,
        ...(parentId ? { parentId } : {}),
        parameters,
        ...(attributes ? { attributes } : {}),
        area,
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
  if (
    topology.source &&
    (!topology.source.repository ||
      !topology.source.revision ||
      !/^[a-f0-9]{64}$/.test(topology.source.planSha256) ||
      !/^[a-f0-9]{64}$/.test(topology.source.modelSha256))
  ) {
    diagnostics.push({
      path: "source",
      code: "invalid_source",
      message: "provenance source, revision, and SHA-256 values are required",
    });
  }
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
    const area = node.area;
    const validAreaValue =
      area &&
      (area.value === null || (Number.isFinite(area.value) && area.value > 0));
    const valueRequired =
      area && ["measured", "estimated"].includes(area.status);
    if (
      !area ||
      !["measured", "estimated", "aggregate", "unknown"].includes(
        area.status,
      ) ||
      area.unit !== "um2" ||
      !area.source ||
      !validAreaValue ||
      (valueRequired && area.value === null) ||
      (area.status === "unknown" && area.value !== null)
    ) {
      diagnostics.push({
        path: `${path}.area`,
        code: "invalid_area",
        message:
          "area must use um2, carry a source, and match its evidence status",
      });
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
    } else if (node.parentId) {
      const parent = nodeById.get(node.parentId)!;
      if (definitionById.get(parent.definitionId)?.kind !== "container") {
        diagnostics.push({
          path: `nodes[${index}].parentId`,
          code: "invalid_parent",
          message: `parent ${node.parentId} is not a hierarchy container`,
        });
      }
      const visited = new Set([node.id]);
      let ancestor: TopologyNode | undefined = parent;
      while (ancestor) {
        if (visited.has(ancestor.id)) {
          diagnostics.push({
            path: `nodes[${index}].parentId`,
            code: "invalid_parent",
            message: "hierarchy contains a parent cycle",
          });
          break;
        }
        visited.add(ancestor.id);
        ancestor = ancestor.parentId
          ? nodeById.get(ancestor.parentId)
          : undefined;
      }
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
    if (
      fromPort.widthBits !== null &&
      toPort.widthBits !== null &&
      fromPort.widthBits !== toPort.widthBits
    ) {
      diagnostics.push({
        path,
        code: "width_mismatch",
        message: `${fromPort.widthBits}-bit output cannot connect to ${toPort.widthBits}-bit input`,
      });
    }
    const inputKey = `${edge.to.nodeId}.${edge.to.portId}`;
    if (occupiedInputs.has(inputKey) && toPort.cardinality === "one") {
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

export interface TopologicalSortResult {
  readonly orderedNodeIds: readonly string[];
  readonly rankByNodeId: ReadonlyMap<string, number>;
  readonly cyclicNodeIds: readonly string[];
  readonly rankCount: number;
}

interface ModuleFlowEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly queueNodeId?: string;
}

function moduleFlowEdges(
  topology: ArchitectureTopology,
  definitionById: ReadonlyMap<string, BrickDefinition>,
): readonly ModuleFlowEdge[] {
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const kindOf = (nodeId: string) => {
    const node = nodeById.get(nodeId);
    return node ? definitionById.get(node.definitionId)?.kind : undefined;
  };
  const result: ModuleFlowEdge[] = [];
  for (const edge of topology.edges) {
    if (
      kindOf(edge.from.nodeId) !== "queue" &&
      kindOf(edge.to.nodeId) !== "queue"
    ) {
      result.push({ fromNodeId: edge.from.nodeId, toNodeId: edge.to.nodeId });
    }
  }
  for (const queue of topology.nodes.filter(
    (node) => definitionById.get(node.definitionId)?.kind === "queue",
  )) {
    const incoming = topology.edges.filter(
      (edge) =>
        edge.to.nodeId === queue.id && kindOf(edge.from.nodeId) !== "queue",
    );
    const outgoing = topology.edges.filter(
      (edge) =>
        edge.from.nodeId === queue.id && kindOf(edge.to.nodeId) !== "queue",
    );
    for (const producer of incoming) {
      for (const consumer of outgoing) {
        result.push({
          fromNodeId: producer.from.nodeId,
          toNodeId: consumer.to.nodeId,
          queueNodeId: queue.id,
        });
      }
    }
  }
  return result;
}

export function stableTopologicalSort(
  topology: ArchitectureTopology,
  catalog: ComponentCatalog,
): TopologicalSortResult {
  const definitionById = new Map(
    catalog.definitions.map((definition) => [definition.id, definition]),
  );
  const graphNodes = topology.nodes.filter(
    (node) =>
      !["container", "queue"].includes(
        definitionById.get(node.definitionId)?.kind ?? "container",
      ),
  );
  const graphNodeIds = new Set(graphNodes.map((node) => node.id));
  const indegree = new Map(graphNodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of moduleFlowEdges(topology, definitionById)) {
    if (
      !graphNodeIds.has(edge.fromNodeId) ||
      !graphNodeIds.has(edge.toNodeId)
    ) {
      continue;
    }
    const targets = outgoing.get(edge.fromNodeId) ?? [];
    if (!targets.includes(edge.toNodeId)) {
      targets.push(edge.toNodeId);
      targets.sort();
      outgoing.set(edge.fromNodeId, targets);
      indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) ?? 0) + 1);
    }
  }
  const ready = graphNodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
    .sort();
  const orderedNodeIds: string[] = [];
  const rankByNodeId = new Map(graphNodes.map((node) => [node.id, 0]));
  while (ready.length > 0) {
    const nodeId = ready.shift()!;
    orderedNodeIds.push(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) {
      rankByNodeId.set(
        target,
        Math.max(
          rankByNodeId.get(target) ?? 0,
          (rankByNodeId.get(nodeId) ?? 0) + 1,
        ),
      );
      const remaining = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) {
        ready.push(target);
        ready.sort();
      }
    }
  }
  const ordered = new Set(orderedNodeIds);
  const cyclicNodeIds = graphNodes
    .map((node) => node.id)
    .filter((id) => !ordered.has(id))
    .sort();
  const trailingRank = Math.max(0, ...rankByNodeId.values()) + 1;
  cyclicNodeIds.forEach((id) => rankByNodeId.set(id, trailingRank));
  orderedNodeIds.push(...cyclicNodeIds);
  return {
    orderedNodeIds,
    rankByNodeId,
    cyclicNodeIds,
    rankCount: Math.max(0, ...rankByNodeId.values()) + 1,
  };
}

export interface TopologyHierarchyEntry {
  readonly node: TopologyNode;
  readonly depth: number;
}

export function topologyHierarchy(
  topology: ArchitectureTopology,
): readonly TopologyHierarchyEntry[] {
  const children = new Map<string | undefined, TopologyNode[]>();
  for (const node of topology.nodes) {
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.id.localeCompare(right.id));
  }
  const result: TopologyHierarchyEntry[] = [];
  const visit = (node: TopologyNode, depth: number) => {
    result.push({ node, depth });
    for (const child of children.get(node.id) ?? []) visit(child, depth + 1);
  };
  for (const root of children.get(undefined) ?? []) visit(root, 0);
  return result;
}

interface Point2 {
  readonly x: number;
  readonly z: number;
}

interface Bounds2 {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const RANK_GAP = 9;
const NODE_GAP = 4;
const CONTAINER_PADDING = 4;

function hierarchyDepthByNode(
  topology: ArchitectureTopology,
): ReadonlyMap<string, number> {
  return new Map(
    topologyHierarchy(topology).map(({ node, depth }) => [node.id, depth]),
  );
}

function laneForNode(
  node: TopologyNode,
  nodeById: ReadonlyMap<string, TopologyNode>,
): string {
  const ancestors: TopologyNode[] = [];
  let current = node.parentId ? nodeById.get(node.parentId) : undefined;
  while (current) {
    ancestors.push(current);
    current = current.parentId ? nodeById.get(current.parentId) : undefined;
  }
  if (ancestors.length === 0) return "lane.unscoped";
  return ancestors.length === 1
    ? ancestors[0]!.id
    : ancestors[ancestors.length - 2]!.id;
}

function barycenter(
  nodeId: string,
  neighbors: ReadonlyMap<string, readonly string[]>,
  order: ReadonlyMap<string, number>,
): number | undefined {
  const positions = (neighbors.get(nodeId) ?? [])
    .map((id) => order.get(id))
    .filter((value): value is number => value !== undefined);
  if (positions.length === 0) return undefined;
  return positions.reduce((sum, value) => sum + value, 0) / positions.length;
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
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const hierarchyDepths = hierarchyDepthByNode(topology);
  const sort = stableTopologicalSort(topology, catalog);
  const graphNodes = sort.orderedNodeIds.map((id) => nodeById.get(id)!);
  const queueNodes = topology.nodes
    .filter((node) => definitionById.get(node.definitionId)?.kind === "queue")
    .sort((left, right) => left.id.localeCompare(right.id));
  const flowEdges = moduleFlowEdges(topology, definitionById);
  const laneByNode = new Map(
    graphNodes.map((node) => [node.id, laneForNode(node, nodeById)]),
  );
  const laneIds = [...new Set(laneByNode.values())].sort((left, right) => {
    const minimumRank = (laneId: string) =>
      Math.min(
        ...graphNodes
          .filter((node) => laneByNode.get(node.id) === laneId)
          .map((node) => sort.rankByNodeId.get(node.id) ?? 0),
      );
    return minimumRank(left) - minimumRank(right) || left.localeCompare(right);
  });
  const laneIndex = new Map(laneIds.map((id, index) => [id, index]));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const edge of flowEdges) {
    const predecessors = incoming.get(edge.toNodeId) ?? [];
    predecessors.push(edge.fromNodeId);
    incoming.set(edge.toNodeId, predecessors);
    const successors = outgoing.get(edge.fromNodeId) ?? [];
    successors.push(edge.toNodeId);
    outgoing.set(edge.fromNodeId, successors);
  }
  const nodesByRank = new Map<number, string[]>();
  for (const node of graphNodes) {
    const rank = sort.rankByNodeId.get(node.id) ?? 0;
    const nodes = nodesByRank.get(rank) ?? [];
    nodes.push(node.id);
    nodesByRank.set(rank, nodes);
  }
  const compareInitial = (left: string, right: string) =>
    (laneIndex.get(laneByNode.get(left)!) ?? 0) -
      (laneIndex.get(laneByNode.get(right)!) ?? 0) || left.localeCompare(right);
  for (const nodes of nodesByRank.values()) nodes.sort(compareInitial);

  const order = new Map<string, number>();
  const refreshOrder = () => {
    for (const nodes of nodesByRank.values()) {
      nodes.forEach((id, index) => order.set(id, index));
    }
  };
  refreshOrder();
  const sweepRank = (
    rank: number,
    neighbors: ReadonlyMap<string, readonly string[]>,
  ) => {
    const nodes = nodesByRank.get(rank);
    if (!nodes) return;
    nodes.sort((left, right) => {
      const leftCenter = barycenter(left, neighbors, order);
      const rightCenter = barycenter(right, neighbors, order);
      if (leftCenter !== undefined && rightCenter !== undefined) {
        return leftCenter - rightCenter || left.localeCompare(right);
      }
      if (leftCenter !== undefined) return -1;
      if (rightCenter !== undefined) return 1;
      return left.localeCompare(right);
    });
    nodes.forEach((id, index) => order.set(id, index));
  };
  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (let rank = 1; rank < sort.rankCount; rank += 1) {
      sweepRank(rank, incoming);
    }
    for (let rank = sort.rankCount - 2; rank >= 0; rank -= 1) {
      sweepRank(rank, outgoing);
    }
  }

  const rankWidths = Array.from({ length: sort.rankCount }, (_, rank) =>
    Math.max(
      1,
      ...(nodesByRank.get(rank) ?? []).map(
        (id) => definitionById.get(nodeById.get(id)!.definitionId)!.size.x,
      ),
    ),
  );
  const totalWidth =
    rankWidths.reduce((sum, width) => sum + width, 0) +
    RANK_GAP * Math.max(0, rankWidths.length - 1);
  const rankX: number[] = [];
  let cursorX = -totalWidth / 2;
  for (const width of rankWidths) {
    rankX.push(cursorX + width / 2);
    cursorX += width + RANK_GAP;
  }

  const positions = new Map<string, Point2>();
  for (let rank = 0; rank < sort.rankCount; rank += 1) {
    const nodes = nodesByRank.get(rank) ?? [];
    const totalDepth = nodes.reduce(
      (sum, id, index) =>
        sum +
        definitionById.get(nodeById.get(id)!.definitionId)!.size.z +
        (index > 0 ? NODE_GAP : 0),
      0,
    );
    let z = -totalDepth / 2;
    for (const id of nodes) {
      const size = definitionById.get(nodeById.get(id)!.definitionId)!.size;
      positions.set(id, { x: rankX[rank]!, z: z + size.z / 2 });
      z += size.z + NODE_GAP;
    }
  }

  const averagePosition = (ids: readonly string[]): Point2 | undefined => {
    const values = ids
      .map((id) => positions.get(id))
      .filter((point): point is Point2 => point !== undefined);
    if (values.length === 0) return undefined;
    return {
      x: values.reduce((sum, point) => sum + point.x, 0) / values.length,
      z: values.reduce((sum, point) => sum + point.z, 0) / values.length,
    };
  };
  const queueEndpoints = (nodeId: string) => {
    const producerIds = topology.edges
      .filter((edge) => edge.to.nodeId === nodeId)
      .map((edge) => edge.from.nodeId);
    const consumerIds = topology.edges
      .filter((edge) => edge.from.nodeId === nodeId)
      .map((edge) => edge.to.nodeId);
    return {
      producerIds,
      consumerIds,
      producer: averagePosition(producerIds),
      consumer: averagePosition(consumerIds),
    };
  };
  const queuePosition = (nodeId: string): Point2 => {
    const endpoints = queueEndpoints(nodeId);
    if (endpoints.producer && endpoints.consumer) {
      return {
        x: (endpoints.producer.x + endpoints.consumer.x) / 2,
        z: (endpoints.producer.z + endpoints.consumer.z) / 2,
      };
    }
    return endpoints.producer ?? endpoints.consumer ?? { x: 0, z: 0 };
  };
  const queueYawRadians = (nodeId: string): number => {
    const endpoints = queueEndpoints(nodeId);
    const current = queuePosition(nodeId);
    const start = endpoints.producer ?? current;
    const end = endpoints.consumer ?? current;
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    if (deltaX === 0 && deltaZ === 0) return 0;
    return Math.atan2(-deltaZ, deltaX);
  };

  const children = new Map<string | undefined, TopologyNode[]>();
  for (const node of topology.nodes) {
    const values = children.get(node.parentId) ?? [];
    values.push(node);
    children.set(node.parentId, values);
  }
  const boundsByNode = new Map<string, Bounds2>();
  for (const node of graphNodes) {
    const position = positions.get(node.id)!;
    const size = definitionById.get(node.definitionId)!.size;
    boundsByNode.set(node.id, {
      minX: position.x - size.x / 2,
      maxX: position.x + size.x / 2,
      minZ: position.z - size.z / 2,
      maxZ: position.z + size.z / 2,
    });
  }
  const containerNodes = topologyHierarchy(topology)
    .filter(
      ({ node }) => definitionById.get(node.definitionId)?.kind === "container",
    )
    .sort(
      (left, right) =>
        right.depth - left.depth || left.node.id.localeCompare(right.node.id),
    );
  const containerSize = new Map<string, BrickSize>();
  const containerPosition = new Map<string, Point2>();
  for (const { node } of containerNodes) {
    const childBounds = (children.get(node.id) ?? [])
      .map((child) => boundsByNode.get(child.id))
      .filter((bounds): bounds is Bounds2 => bounds !== undefined);
    const fallbackLane = (laneIndex.get(node.id) ?? 0) * 12;
    const bounds =
      childBounds.length > 0
        ? {
            minX:
              Math.min(...childBounds.map((item) => item.minX)) -
              CONTAINER_PADDING,
            maxX:
              Math.max(...childBounds.map((item) => item.maxX)) +
              CONTAINER_PADDING,
            minZ:
              Math.min(...childBounds.map((item) => item.minZ)) -
              CONTAINER_PADDING,
            maxZ:
              Math.max(...childBounds.map((item) => item.maxZ)) +
              CONTAINER_PADDING,
          }
        : {
            minX: -5,
            maxX: 5,
            minZ: fallbackLane - 4,
            maxZ: fallbackLane + 4,
          };
    boundsByNode.set(node.id, bounds);
    containerSize.set(node.id, {
      x: bounds.maxX - bounds.minX,
      y: 0.5,
      z: bounds.maxZ - bounds.minZ,
    });
    containerPosition.set(node.id, {
      x: (bounds.minX + bounds.maxX) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
    });
  }

  const topologyOrder = new Map(
    sort.orderedNodeIds.map((id, index) => [id, index]),
  );
  const hierarchyEntries = topologyHierarchy(topology);
  const instances: BrickInstance[] = [];
  for (const { node, depth } of hierarchyEntries.filter(
    ({ node }) => definitionById.get(node.definitionId)?.kind === "container",
  )) {
    const definition = definitionById.get(node.definitionId)!;
    const position = containerPosition.get(node.id) ?? { x: 0, z: 0 };
    const descendantRanks = topologyHierarchy(topology)
      .filter(
        ({ node: candidate }) =>
          candidate.id !== node.id &&
          candidate.parentId === node.id &&
          sort.rankByNodeId.has(candidate.id),
      )
      .map(({ node: candidate }) => sort.rankByNodeId.get(candidate.id)!);
    instances.push({
      id: node.id,
      definitionId: node.definitionId,
      ...(node.label ? { label: node.label } : {}),
      transform: {
        position: worldPosition(
          Math.round(position.x),
          depth,
          Math.round(position.z),
        ),
        yawRadians: 0,
      },
      parameters: {
        ...defaultParameters(definition),
        ...node.parameters,
      },
      visualSize: containerSize.get(node.id) ?? definition.size,
      hierarchyDepth: depth,
      topologyRank:
        descendantRanks.length > 0 ? Math.min(...descendantRanks) : 0,
      topologyOrder: -1,
      laneId: node.id,
    });
  }
  for (const node of graphNodes) {
    const definition = definitionById.get(node.definitionId)!;
    const position = positions.get(node.id)!;
    const depth = hierarchyDepths.get(node.id) ?? 0;
    instances.push({
      id: node.id,
      definitionId: node.definitionId,
      ...(node.label ? { label: node.label } : {}),
      transform: {
        position: worldPosition(
          Math.round(position.x),
          depth,
          Math.round(position.z),
        ),
        yawRadians: definition.kind === "queue" ? queueYawRadians(node.id) : 0,
      },
      parameters: {
        ...defaultParameters(definition),
        ...node.parameters,
      },
      hierarchyDepth: depth,
      topologyRank: sort.rankByNodeId.get(node.id) ?? 0,
      topologyOrder: topologyOrder.get(node.id) ?? 0,
      laneId: laneByNode.get(node.id)!,
    });
  }
  for (const node of queueNodes) {
    const definition = definitionById.get(node.definitionId)!;
    const position = queuePosition(node.id);
    const endpoints = queueEndpoints(node.id);
    const producerRanks = endpoints.producerIds
      .map((id) => sort.rankByNodeId.get(id))
      .filter((rank): rank is number => rank !== undefined);
    const depth = hierarchyDepths.get(node.id) ?? 0;
    instances.push({
      id: node.id,
      definitionId: node.definitionId,
      ...(node.label ? { label: node.label } : {}),
      transform: {
        position: worldPosition(
          Math.round(position.x),
          depth,
          Math.round(position.z),
        ),
        yawRadians: queueYawRadians(node.id),
      },
      parameters: {
        ...defaultParameters(definition),
        ...node.parameters,
      },
      hierarchyDepth: depth,
      topologyRank:
        producerRanks.length > 0 ? Math.max(...producerRanks) + 0.5 : 0,
      topologyOrder: graphNodes.length + queueNodes.indexOf(node),
      laneId: laneForNode(node, nodeById),
    });
  }
  const kindOfNode = (nodeId: string) =>
    definitionById.get(nodeById.get(nodeId)!.definitionId)!.kind;
  const queueCorridors = queueNodes.flatMap((queue) => {
    const incomingEdges = topology.edges.filter(
      (edge) =>
        edge.to.nodeId === queue.id && kindOfNode(edge.from.nodeId) !== "queue",
    );
    const outgoingEdges = topology.edges.filter(
      (edge) =>
        edge.from.nodeId === queue.id && kindOfNode(edge.to.nodeId) !== "queue",
    );
    return incomingEdges.flatMap((producer, producerIndex) =>
      outgoingEdges.map((consumer, consumerIndex) => ({
        id:
          incomingEdges.length === 1 && outgoingEdges.length === 1
            ? queue.id
            : `${queue.id}.${producerIndex}.${consumerIndex}`,
        queueInstanceId: queue.id,
        from: {
          instanceId: producer.from.nodeId,
          portId: producer.from.portId,
        },
        to: {
          instanceId: consumer.to.nodeId,
          portId: consumer.to.portId,
        },
        topologyEdgeIds: [producer.id, consumer.id] as const,
      })),
    );
  });
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
    queueCorridors,
  };
}

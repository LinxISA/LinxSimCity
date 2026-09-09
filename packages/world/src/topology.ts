import type {
  BrickDefinition,
  BrickSize,
  ComponentCatalog,
} from "@linxsimcity/component-catalog";
import {
  stableTopologicalSort,
  topologyFingerprint,
  topologyHierarchy,
  topologyModuleFlowEdges,
  validateArchitectureTopology,
} from "@linxsimcity/topology";
import type { ArchitectureTopology, TopologyNode } from "@linxsimcity/topology";

import { worldPosition } from "./coordinates.js";
import type { BrickInstance, GeneratedWorld } from "./types.js";

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
  const flowEdges = topologyModuleFlowEdges(topology, catalog);
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
          0,
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
          0,
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
          0,
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

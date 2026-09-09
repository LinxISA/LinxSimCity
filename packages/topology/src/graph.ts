import type {
  BrickDefinition,
  ComponentCatalog,
} from "@linxsimcity/component-catalog";

import type {
  ArchitectureTopology,
  TopologicalSortResult,
  TopologyConnectionIndex,
  TopologyEdge,
  TopologyHierarchyEntry,
  TopologyModuleFlowEdge,
  TopologyNode,
} from "./types.js";

function portKey(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`;
}

export function topologyConnectionIndex(
  topology: ArchitectureTopology,
): TopologyConnectionIndex {
  const incoming = new Map<string, TopologyEdge[]>();
  const outgoing = new Map<string, TopologyEdge[]>();
  const byPort = new Map<string, TopologyEdge[]>();
  for (const node of topology.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of topology.edges) {
    incoming.get(edge.to.nodeId)?.push(edge);
    outgoing.get(edge.from.nodeId)?.push(edge);
    for (const endpoint of [edge.from, edge.to]) {
      const key = portKey(endpoint.nodeId, endpoint.portId);
      const edges = byPort.get(key) ?? [];
      edges.push(edge);
      byPort.set(key, edges);
    }
  }
  return {
    byNodeId: new Map(
      topology.nodes.map((node) => [
        node.id,
        {
          incoming: incoming.get(node.id) ?? [],
          outgoing: outgoing.get(node.id) ?? [],
        },
      ]),
    ),
    byPort,
  };
}

export function topologyConnectionsForNode(
  topology: ArchitectureTopology,
  nodeId: string,
) {
  return (
    topologyConnectionIndex(topology).byNodeId.get(nodeId) ?? {
      incoming: [],
      outgoing: [],
    }
  );
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

function moduleFlowEdges(
  topology: ArchitectureTopology,
  definitionById: ReadonlyMap<string, BrickDefinition>,
): readonly TopologyModuleFlowEdge[] {
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const kindOf = (nodeId: string) => {
    const node = nodeById.get(nodeId);
    return node ? definitionById.get(node.definitionId)?.kind : undefined;
  };
  const result: TopologyModuleFlowEdge[] = [];
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

export function topologyModuleFlowEdges(
  topology: ArchitectureTopology,
  catalog: ComponentCatalog,
): readonly TopologyModuleFlowEdge[] {
  const definitionById = new Map(
    catalog.definitions.map((definition) => [definition.id, definition]),
  );
  return moduleFlowEdges(topology, definitionById);
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

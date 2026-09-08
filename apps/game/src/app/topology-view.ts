import type {
  ArchitectureTopology,
  TopologyEdge,
  TopologyNode,
} from "@linxsimcity/world";

export type HierarchyDepthSlice = "all" | "l1" | "l2" | "leaf";

export interface TopologyViewPreferences {
  readonly depthSlice: HierarchyDepthSlice;
  readonly collapsedNodeIds: readonly string[];
  readonly focusedEdgeIds: readonly string[];
}

export interface TopologyViewEntry {
  readonly node: TopologyNode;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
}

export interface TopologyPathFocus {
  readonly edgeIds: readonly string[];
  readonly nodeIds: readonly string[];
}

export const DEFAULT_TOPOLOGY_VIEW_PREFERENCES: TopologyViewPreferences = {
  depthSlice: "all",
  collapsedNodeIds: [],
  focusedEdgeIds: [],
};

function hierarchyInTopologicalOrder(
  topology: ArchitectureTopology,
  children: ReadonlyMap<string | undefined, readonly string[]>,
): readonly { readonly node: TopologyNode; readonly depth: number }[] {
  const originalOrder = new Map(
    topology.nodes.map((node, index) => [node.id, index]),
  );
  const indegree = new Map(topology.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of topology.edges) {
    indegree.set(edge.to.nodeId, (indegree.get(edge.to.nodeId) ?? 0) + 1);
    const targets = outgoing.get(edge.from.nodeId) ?? [];
    targets.push(edge.to.nodeId);
    outgoing.set(edge.from.nodeId, targets);
  }
  const ready = topology.nodes.filter((node) => indegree.get(node.id) === 0);
  const order = new Map<string, number>();
  while (ready.length > 0) {
    ready.sort(
      (left, right) =>
        (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0),
    );
    const node = ready.shift()!;
    order.set(node.id, order.size);
    for (const target of outgoing.get(node.id) ?? []) {
      const next = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, next);
      if (next === 0) {
        const targetNode = topology.nodes[originalOrder.get(target) ?? -1];
        if (targetNode) ready.push(targetNode);
      }
    }
  }
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const result: { readonly node: TopologyNode; readonly depth: number }[] = [];
  const visit = (nodeId: string, depth: number) => {
    const node = nodeById.get(nodeId);
    if (!node) return;
    result.push({ node, depth });
    const childIds = [...(children.get(nodeId) ?? [])].sort(
      (left, right) =>
        (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right) ?? Number.MAX_SAFE_INTEGER) ||
        left.localeCompare(right),
    );
    for (const childId of childIds) visit(childId, depth + 1);
  };
  const roots = [...(children.get(undefined) ?? [])].sort(
    (left, right) =>
      (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right) ?? Number.MAX_SAFE_INTEGER) ||
      left.localeCompare(right),
  );
  for (const root of roots) visit(root, 0);
  return result;
}

function isDepthSlice(value: unknown): value is HierarchyDepthSlice {
  return (
    value === "all" || value === "l1" || value === "l2" || value === "leaf"
  );
}

export function parseTopologyViewPreferences(
  raw: string | null,
): TopologyViewPreferences {
  if (!raw) return DEFAULT_TOPOLOGY_VIEW_PREFERENCES;
  try {
    const value = JSON.parse(raw) as Partial<TopologyViewPreferences>;
    return {
      depthSlice: isDepthSlice(value.depthSlice) ? value.depthSlice : "all",
      collapsedNodeIds: Array.isArray(value.collapsedNodeIds)
        ? value.collapsedNodeIds.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      focusedEdgeIds: Array.isArray(value.focusedEdgeIds)
        ? value.focusedEdgeIds.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    };
  } catch {
    return DEFAULT_TOPOLOGY_VIEW_PREFERENCES;
  }
}

function sliceIncludes(
  slice: HierarchyDepthSlice,
  depth: number,
  hasChildren: boolean,
): boolean {
  if (slice === "all") return true;
  if (slice === "leaf") return !hasChildren;
  return depth <= (slice === "l1" ? 1 : 2);
}

export function deriveTopologyView(
  topology: ArchitectureTopology,
  preferences: TopologyViewPreferences,
): {
  readonly entries: readonly TopologyViewEntry[];
  readonly visibleNodeIds: ReadonlySet<string>;
  readonly focusedEdgeIds: ReadonlySet<string>;
  readonly focusedNodeIds: ReadonlySet<string>;
} {
  const children = new Map<string | undefined, string[]>();
  for (const node of topology.nodes) {
    const values = children.get(node.parentId) ?? [];
    values.push(node.id);
    children.set(node.parentId, values);
  }
  const collapsed = new Set(preferences.collapsedNodeIds);
  const hiddenByCollapse = new Set<string>();
  const hideDescendants = (nodeId: string) => {
    for (const childId of children.get(nodeId) ?? []) {
      hiddenByCollapse.add(childId);
      hideDescendants(childId);
    }
  };
  for (const nodeId of collapsed) hideDescendants(nodeId);

  const topologyEdgeIds = new Set(topology.edges.map((edge) => edge.id));
  const focusedEdgeIds = new Set(
    preferences.focusedEdgeIds.filter((id) => topologyEdgeIds.has(id)),
  );
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const focusedNodeIds = new Set<string>();
  for (const edge of topology.edges) {
    if (!focusedEdgeIds.has(edge.id)) continue;
    focusedNodeIds.add(edge.from.nodeId);
    focusedNodeIds.add(edge.to.nodeId);
    const queueNode = [edge.from.nodeId, edge.to.nodeId].find(
      (nodeId) => nodeById.get(nodeId)?.definitionId === "core.queue",
    );
    if (queueNode) {
      for (const neighbor of topology.edges) {
        if (
          neighbor.from.nodeId === queueNode ||
          neighbor.to.nodeId === queueNode
        ) {
          focusedNodeIds.add(neighbor.from.nodeId);
          focusedNodeIds.add(neighbor.to.nodeId);
        }
      }
    }
  }
  const focusRevealNodeIds = new Set(focusedNodeIds);
  for (const nodeId of focusedNodeIds) {
    let node = nodeById.get(nodeId);
    while (node?.parentId) {
      focusRevealNodeIds.add(node.parentId);
      node = nodeById.get(node.parentId);
    }
  }
  const entries = hierarchyInTopologicalOrder(topology, children).flatMap(
    ({ node, depth }) => {
      const hasChildren = (children.get(node.id)?.length ?? 0) > 0;
      return focusRevealNodeIds.has(node.id) ||
        (!hiddenByCollapse.has(node.id) &&
          sliceIncludes(preferences.depthSlice, depth, hasChildren))
        ? [{ node, depth, hasChildren, expanded: !collapsed.has(node.id) }]
        : [];
    },
  );
  const visibleNodeIds = new Set(entries.map((entry) => entry.node.id));
  return { entries, visibleNodeIds, focusedEdgeIds, focusedNodeIds };
}

function edgeNeighbor(
  edge: TopologyEdge,
  nodeId: string,
  directed: boolean,
): string | undefined {
  if (edge.from.nodeId === nodeId) return edge.to.nodeId;
  if (!directed && edge.to.nodeId === nodeId) return edge.from.nodeId;
  return undefined;
}

function searchPath(
  topology: ArchitectureTopology,
  fromNodeId: string,
  toNodeId: string,
  directed: boolean,
): TopologyPathFocus | undefined {
  const queue = [fromNodeId];
  const visited = new Set(queue);
  const previous = new Map<
    string,
    { readonly nodeId: string; readonly edgeId: string }
  >();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toNodeId) break;
    for (const edge of topology.edges) {
      const next = edgeNeighbor(edge, current, directed);
      if (!next || visited.has(next)) continue;
      visited.add(next);
      previous.set(next, { nodeId: current, edgeId: edge.id });
      queue.push(next);
    }
  }
  if (!visited.has(toNodeId)) return undefined;
  const nodeIds = [toNodeId];
  const edgeIds: string[] = [];
  let current = toNodeId;
  while (current !== fromNodeId) {
    const step = previous.get(current);
    if (!step) return undefined;
    edgeIds.unshift(step.edgeId);
    nodeIds.unshift(step.nodeId);
    current = step.nodeId;
  }
  return { edgeIds, nodeIds };
}

export function topologyPathBetween(
  topology: ArchitectureTopology,
  fromNodeId: string,
  toNodeId: string,
): TopologyPathFocus | undefined {
  if (fromNodeId === toNodeId) return { edgeIds: [], nodeIds: [fromNodeId] };
  return (
    searchPath(topology, fromNodeId, toNodeId, true) ??
    searchPath(topology, fromNodeId, toNodeId, false)
  );
}

export function topologyPathForTraceAssociation(
  topology: ArchitectureTopology,
  entityNodeId: string,
  storageNodeId: string,
): TopologyPathFocus | undefined {
  const path = topologyPathBetween(topology, entityNodeId, storageNodeId);
  if (path?.edgeIds.length) return path;
  const incidentEdges = topology.edges.filter(
    (edge) =>
      edge.from.nodeId === entityNodeId || edge.to.nodeId === entityNodeId,
  );
  if (incidentEdges.length === 0) return path;
  return {
    edgeIds: incidentEdges.map((edge) => edge.id),
    nodeIds: [
      ...new Set(
        incidentEdges.flatMap((edge) => [edge.from.nodeId, edge.to.nodeId]),
      ),
    ],
  };
}

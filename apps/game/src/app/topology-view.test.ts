import { CORE_CATALOG } from "@linxsimcity/component-catalog";
import {
  generateWorldFromTopology,
  topologyFingerprint,
  type ArchitectureTopology,
} from "@linxsimcity/world";
import { describe, expect, test } from "vitest";

import {
  DEFAULT_TOPOLOGY_VIEW_PREFERENCES,
  deriveTopologyView,
  parseTopologyViewPreferences,
  topologyPathBetween,
  topologyPathForTraceAssociation,
} from "./topology-view.js";

const area = {
  value: null,
  unit: "um2",
  status: "unknown",
  source: "test",
} as const;
const topology: ArchitectureTopology = {
  schema: "linxsimcity.topology",
  schemaVersion: "1",
  id: "hierarchy",
  name: "Hierarchy",
  revision: "test",
  nodes: [
    { id: "root", definitionId: "core.container", parameters: {}, area },
    {
      id: "l1",
      definitionId: "core.container",
      parentId: "root",
      parameters: {},
      area,
    },
    {
      id: "l2",
      definitionId: "core.container",
      parentId: "l1",
      parameters: {},
      area,
    },
    {
      id: "source",
      definitionId: "ac.source",
      parentId: "l2",
      parameters: {},
      area,
    },
    {
      id: "queue",
      definitionId: "core.queue",
      parentId: "l2",
      parameters: { capacity: 4 },
      area,
    },
    {
      id: "sink",
      definitionId: "ac.tma-engine",
      parentId: "l1",
      parameters: {},
      area,
    },
  ],
  edges: [
    {
      id: "edge.source-queue",
      from: { nodeId: "source", portId: "out" },
      to: { nodeId: "queue", portId: "in" },
    },
    {
      id: "edge.queue-sink",
      from: { nodeId: "queue", portId: "out" },
      to: { nodeId: "sink", portId: "in" },
    },
  ],
};

describe("topology view derivation", () => {
  test("computes cumulative depth and leaf slices with parent collapse", () => {
    const l1 = deriveTopologyView(topology, {
      ...DEFAULT_TOPOLOGY_VIEW_PREFERENCES,
      depthSlice: "l1",
    });
    expect([...l1.visibleNodeIds]).toEqual(["root", "l1"]);
    const l2 = deriveTopologyView(topology, {
      ...DEFAULT_TOPOLOGY_VIEW_PREFERENCES,
      depthSlice: "l2",
    });
    expect([...l2.visibleNodeIds]).toEqual(["root", "l1", "l2", "sink"]);
    const leaf = deriveTopologyView(topology, {
      ...DEFAULT_TOPOLOGY_VIEW_PREFERENCES,
      depthSlice: "leaf",
    });
    expect([...leaf.visibleNodeIds]).toEqual(["source", "queue", "sink"]);
    const collapsed = deriveTopologyView(topology, {
      ...DEFAULT_TOPOLOGY_VIEW_PREFERENCES,
      collapsedNodeIds: ["l1"],
    });
    expect([...collapsed.visibleNodeIds]).toEqual(["root", "l1"]);

    const focusedThroughCollapse = deriveTopologyView(topology, {
      depthSlice: "l1",
      collapsedNodeIds: ["l1", "l2"],
      focusedEdgeIds: ["edge.source-queue"],
    });
    expect(focusedThroughCollapse.visibleNodeIds).toEqual(
      new Set(["root", "l1", "l2", "source", "queue", "sink"]),
    );
  });

  test("display preferences never enter the topology fingerprint", () => {
    const before = topologyFingerprint(topology);
    deriveTopologyView(topology, {
      depthSlice: "leaf",
      collapsedNodeIds: ["l2"],
      focusedEdgeIds: ["edge.source-queue"],
    });
    expect(topologyFingerprint(topology)).toBe(before);
    expect(
      generateWorldFromTopology(topology, CORE_CATALOG).topologyFingerprint,
    ).toBe(before);
  });

  test("focused paths contain only unique edge IDs from topology", () => {
    const path = topologyPathBetween(topology, "source", "sink");
    expect(path?.edgeIds).toEqual(["edge.source-queue", "edge.queue-sink"]);
    expect(new Set(path?.edgeIds).size).toBe(path?.edgeIds.length);
    const sourceIds = new Set(topology.edges.map((edge) => edge.id));
    expect(path?.edgeIds.every((id) => sourceIds.has(id))).toBe(true);

    const associationPath = topologyPathForTraceAssociation(
      topology,
      "queue",
      "root",
    );
    expect(associationPath).toBeUndefined();
    expect(topologyPathBetween(topology, "sink", "source")).toBeUndefined();
  });

  test("restores only valid persisted interaction state", () => {
    expect(
      parseTopologyViewPreferences(
        JSON.stringify({
          depthSlice: "leaf",
          collapsedNodeIds: ["l1", 42],
          focusedEdgeIds: ["edge.source-queue", null],
        }),
      ),
    ).toEqual({
      depthSlice: "leaf",
      collapsedNodeIds: ["l1"],
      focusedEdgeIds: ["edge.source-queue"],
    });
    expect(parseTopologyViewPreferences("not json")).toEqual(
      DEFAULT_TOPOLOGY_VIEW_PREFERENCES,
    );
  });
});

import { CORE_CATALOG } from "@linxsimcity/component-catalog";
import { describe, expect, test } from "vitest";

import {
  addPosition,
  generateWorldFromTopology,
  positionToTuple,
  stableTopologicalSort,
  topologyFingerprint,
  topologyHierarchy,
  validateArchitectureTopology,
  worldPosition,
} from "./index.js";
import type { ArchitectureTopology } from "./index.js";

const unknownArea = {
  value: null,
  unit: "um2",
  status: "unknown",
  source: "test:no-area",
} as const;

function topology(): ArchitectureTopology {
  return {
    schema: "linxsimcity.topology",
    schemaVersion: "1",
    id: "test.pipeline",
    name: "Test pipeline",
    revision: "test-revision",
    nodes: [
      {
        id: "queue.1",
        definitionId: "core.queue",
        parameters: { capacity: 16 },
        area: unknownArea,
      },
      {
        id: "vector.1",
        definitionId: "core.vector",
        parameters: { lanes: 8 },
        area: unknownArea,
      },
      {
        id: "sram.1",
        definitionId: "core.sram",
        parameters: { banks: 8 },
        area: unknownArea,
      },
    ],
    edges: [
      {
        id: "edge.queue-vector",
        from: { nodeId: "queue.1", portId: "out" },
        to: { nodeId: "vector.1", portId: "issue" },
      },
      {
        id: "edge.sram-vector",
        from: { nodeId: "sram.1", portId: "tile-out" },
        to: { nodeId: "vector.1", portId: "tile" },
      },
    ],
  };
}

describe("world coordinates", () => {
  test("normalize positive and negative positions across chunks", () => {
    expect(positionToTuple(worldPosition(-65, 130, 63))).toEqual([
      -65, 130, 63,
    ]);
    expect(
      positionToTuple(addPosition(worldPosition(63, 0, 0), [2, -1, 0])),
    ).toEqual([65, -1, 0]);
  });
});

describe("topology-driven world generation", () => {
  test("performs a stable topological sort before assigning X positions", () => {
    const source = topology();
    const sorted = stableTopologicalSort(source, CORE_CATALOG);
    expect(sorted.orderedNodeIds).toEqual(["queue.1", "sram.1", "vector.1"]);
    expect(sorted.rankByNodeId.get("queue.1")).toBe(0);
    expect(sorted.rankByNodeId.get("sram.1")).toBe(0);
    expect(sorted.rankByNodeId.get("vector.1")).toBe(1);
    expect(sorted.cyclicNodeIds).toEqual([]);
    expect(
      stableTopologicalSort(
        {
          ...source,
          nodes: [...source.nodes].reverse(),
          edges: [...source.edges].reverse(),
        },
        CORE_CATALOG,
      ).orderedNodeIds,
    ).toEqual(sorted.orderedNodeIds);

    const world = generateWorldFromTopology(source, CORE_CATALOG);
    const xById = new Map(
      world.instances.map((instance) => [
        instance.id,
        positionToTuple(instance.transform.position)[0],
      ]),
    );
    for (const edge of source.edges) {
      expect(xById.get(edge.from.nodeId)!).toBeLessThan(
        xById.get(edge.to.nodeId)!,
      );
    }
  });

  test("barycenter ordering removes a simple two-edge crossing", () => {
    const node = (id: string) => ({
      id,
      definitionId: "ac.transform",
      parameters: { latency: 1 },
      area: unknownArea,
    });
    const crossing: ArchitectureTopology = {
      schema: "linxsimcity.topology",
      schemaVersion: "1",
      id: "test.crossing",
      name: "Crossing reduction",
      revision: "test-revision",
      nodes: [node("a"), node("b"), node("c"), node("d")],
      edges: [
        {
          id: "edge.a-d",
          from: { nodeId: "a", portId: "out" },
          to: { nodeId: "d", portId: "in" },
        },
        {
          id: "edge.b-c",
          from: { nodeId: "b", portId: "out" },
          to: { nodeId: "c", portId: "in" },
        },
      ],
    };
    const world = generateWorldFromTopology(crossing, CORE_CATALOG);
    const z = new Map(
      world.instances.map((instance) => [
        instance.id,
        positionToTuple(instance.transform.position)[2],
      ]),
    );
    expect(z.get("a")!).toBeLessThan(z.get("b")!);
    expect(z.get("d")!).toBeLessThan(z.get("c")!);
  });

  test("generates every scene connection directly from a valid topology edge", () => {
    const source = topology();
    expect(validateArchitectureTopology(source, CORE_CATALOG)).toEqual([]);
    const world = generateWorldFromTopology(source, CORE_CATALOG);
    expect(world.instances.map((item) => item.id).sort()).toEqual([
      "queue.1",
      "sram.1",
      "vector.1",
    ]);
    expect(world.links).toEqual([
      {
        id: "edge.queue-vector",
        from: { instanceId: "queue.1", portId: "out" },
        to: { instanceId: "vector.1", portId: "issue" },
      },
      {
        id: "edge.sram-vector",
        from: { instanceId: "sram.1", portId: "tile-out" },
        to: { instanceId: "vector.1", portId: "tile" },
      },
    ]);
    expect(world.topologyFingerprint).toBe(topologyFingerprint(source));
  });

  test("keeps generated layout out of the topology fingerprint", () => {
    const source = topology();
    const first = generateWorldFromTopology(source, CORE_CATALOG);
    const movedWorld = {
      ...first,
      instances: first.instances.map((instance, index) => ({
        ...instance,
        transform: {
          ...instance.transform,
          position: worldPosition(index * 100, 0, 0),
        },
      })),
    };
    expect(movedWorld.topologyFingerprint).toBe(first.topologyFingerprint);
  });

  test("draws parent containers around children and preserves hierarchy depth", () => {
    const source = topology();
    const hierarchical: ArchitectureTopology = {
      ...source,
      nodes: [
        {
          id: "scope.root",
          definitionId: "core.container",
          parameters: {},
          area: {
            value: null,
            unit: "um2",
            status: "aggregate",
            source: "test:children-have-unknown-area",
          },
        },
        ...source.nodes.map((node) => ({ ...node, parentId: "scope.root" })),
      ],
    };
    const world = generateWorldFromTopology(hierarchical, CORE_CATALOG);
    const root = world.instances.find((item) => item.id === "scope.root")!;
    const child = world.instances.find((item) => item.id === "queue.1")!;
    expect(root.hierarchyDepth).toBe(0);
    expect(child.hierarchyDepth).toBe(1);
    expect(root.visualSize?.x).toBeGreaterThan(10);
    expect(topologyHierarchy(hierarchical).map((item) => item.depth)).toEqual([
      0, 1, 1, 1,
    ]);
  });

  test("requires an evidence-qualified physical area on every node", () => {
    const source = topology();
    const invalid: ArchitectureTopology = {
      ...source,
      nodes: [
        {
          ...source.nodes[0]!,
          area: {
            value: null,
            unit: "um2",
            status: "measured",
            source: "test:missing-value",
          },
        },
        ...source.nodes.slice(1),
      ],
    };
    expect(validateArchitectureTopology(invalid, CORE_CATALOG)).toContainEqual(
      expect.objectContaining({ code: "invalid_area" }),
    );
  });

  test("rejects a tile edge into a transaction input", () => {
    const invalid: ArchitectureTopology = {
      ...topology(),
      nodes: [
        {
          id: "sram.1",
          definitionId: "core.sram",
          parameters: {},
          area: unknownArea,
        },
        {
          id: "alu.1",
          definitionId: "core.alu",
          parameters: {},
          area: unknownArea,
        },
      ],
      edges: [
        {
          id: "edge.bad",
          from: { nodeId: "sram.1", portId: "tile-out" },
          to: { nodeId: "alu.1", portId: "issue" },
        },
      ],
    };
    expect(validateArchitectureTopology(invalid, CORE_CATALOG)).toContainEqual(
      expect.objectContaining({ code: "protocol_mismatch" }),
    );
  });
});

import { CORE_CATALOG } from "@linxsimcity/component-catalog";
import { describe, expect, test } from "vitest";

import {
  addPosition,
  generateWorldFromTopology,
  positionToTuple,
  topologyFingerprint,
  validateArchitectureTopology,
  worldPosition,
} from "./index.js";
import type { ArchitectureTopology } from "./index.js";

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
      },
      {
        id: "vector.1",
        definitionId: "core.vector",
        parameters: { lanes: 8 },
      },
      {
        id: "sram.1",
        definitionId: "core.sram",
        parameters: { banks: 8 },
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

  test("rejects a tile edge into a transaction input", () => {
    const invalid: ArchitectureTopology = {
      ...topology(),
      nodes: [
        { id: "sram.1", definitionId: "core.sram", parameters: {} },
        { id: "alu.1", definitionId: "core.alu", parameters: {} },
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

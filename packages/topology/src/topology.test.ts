import { readFileSync } from "node:fs";

import { CORE_CATALOG } from "@linxsimcity/component-catalog";
import { describe, expect, test } from "vitest";

import {
  parseArchitectureTopology,
  stableTopologicalSort,
  topologyConnectionIndex,
  topologyConnectionsForNode,
  topologyFingerprint,
  topologyHierarchy,
  topologyModuleFlowEdges,
  validateArchitectureTopology,
  validateTopologySchema,
  type ArchitectureTopology,
} from "./index.js";

const unknownArea = {
  value: null,
  unit: "um2",
  status: "unknown",
  source: "test:no-ppa-area",
} as const;

const multicoreTopology = parseArchitectureTopology(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../fixtures/current/multicore-composite.topology.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);

function topology(): ArchitectureTopology {
  return {
    schema: "linxsimcity.topology",
    schemaVersion: "1",
    id: "test.pipeline",
    name: "Test pipeline",
    revision: "revision-1",
    nodes: [
      {
        id: "scope.root",
        definitionId: "core.container",
        parameters: {},
        area: { ...unknownArea, status: "aggregate" },
      },
      {
        id: "source.1",
        definitionId: "ac.source",
        parentId: "scope.root",
        parameters: {},
        area: unknownArea,
      },
      {
        id: "queue.1",
        definitionId: "core.queue",
        parentId: "scope.root",
        parameters: { capacity: 8 },
        area: unknownArea,
      },
      {
        id: "vector.1",
        definitionId: "core.vector",
        parentId: "scope.root",
        parameters: { lanes: 8 },
        area: unknownArea,
      },
    ],
    edges: [
      {
        id: "edge.source-queue",
        from: { nodeId: "source.1", portId: "out" },
        to: { nodeId: "queue.1", portId: "in" },
      },
      {
        id: "edge.queue-vector",
        from: { nodeId: "queue.1", portId: "out" },
        to: { nodeId: "vector.1", portId: "issue" },
      },
    ],
  };
}

describe("current topology schema", () => {
  test("parses the sole linxsimcity.topology v1 document", () => {
    const source = topology();
    expect(parseArchitectureTopology(source)).toBe(source);
    expect(validateTopologySchema(source)).toEqual([]);
  });

  test.each([
    [
      { schema: "linx-city-v1", schemaVersion: "1", nodes: [], edges: [] },
      "invalid_schema",
    ],
    [
      {
        schema: "linxsimcity.topology",
        schemaVersion: "1",
        id: "x",
        name: "x",
        revision: "x",
        nodes: "bad",
        edges: [],
      },
      "invalid_type",
    ],
    [
      {
        schema: "linxsimcity.topology",
        schemaVersion: "1",
        id: "x",
        name: "x",
        revision: "x",
        nodes: [{ id: "a" }],
        edges: [],
      },
      "missing_field",
    ],
  ] as const)("rejects a malformed current document", (source, code) => {
    expect(validateTopologySchema(source)).toContainEqual(
      expect.objectContaining({ code }),
    );
    expect(() => parseArchitectureTopology(source)).toThrow();
  });
});

describe("current topology semantic contract", () => {
  test("accepts a typed, hierarchical Queue path", () => {
    expect(validateArchitectureTopology(topology(), CORE_CATALOG)).toEqual([]);
  });

  test("accepts one flat namespaced topology for two cores and four PEs", () => {
    expect(
      validateArchitectureTopology(multicoreTopology, CORE_CATALOG),
    ).toEqual([]);
    expect(multicoreTopology.nodes).toHaveLength(19);
    expect(new Set(multicoreTopology.nodes.map((node) => node.id)).size).toBe(
      multicoreTopology.nodes.length,
    );
    expect(new Set(multicoreTopology.edges.map((edge) => edge.id)).size).toBe(
      multicoreTopology.edges.length,
    );
    expect(
      multicoreTopology.nodes.filter(
        (node) =>
          node.definitionId === "core.container" && /\.pe\./.test(node.id),
      ),
    ).toHaveLength(4);
    expect(
      multicoreTopology.nodes
        .filter((node) => node.definitionId === "ac.vector-engine")
        .map((node) => node.id),
    ).toEqual(["core.0.pe.0.vector", "core.1.pe.0.vector"]);

    const hierarchy = new Map(
      topologyHierarchy(multicoreTopology).map(({ node, depth }) => [
        node.id,
        depth,
      ]),
    );
    expect(hierarchy.get("scope.root")).toBe(0);
    expect(hierarchy.get("core.0")).toBe(1);
    expect(hierarchy.get("core.0.pe.0")).toBe(2);
    expect(hierarchy.get("core.0.pe.0.vector")).toBe(3);

    expect(topologyModuleFlowEdges(multicoreTopology, CORE_CATALOG)).toEqual(
      expect.arrayContaining([
        {
          fromNodeId: "core.0.pe.0.source",
          toNodeId: "core.0.pe.0.vector",
          queueNodeId: "core.0.pe.0.queue",
        },
        {
          fromNodeId: "core.1.pe.0.source",
          toNodeId: "core.1.pe.0.vector",
          queueNodeId: "core.1.pe.0.queue",
        },
        {
          fromNodeId: "core.0.pe.0.vector",
          toNodeId: "core.1.pe.1.sink",
        },
      ]),
    );
  });

  test("locates duplicate IDs", () => {
    const source = topology();
    const invalid = { ...source, nodes: [...source.nodes, source.nodes[1]!] };
    expect(validateArchitectureTopology(invalid, CORE_CATALOG)).toContainEqual(
      expect.objectContaining({ path: "nodes[4].id", code: "duplicate_id" }),
    );
  });

  test.each([
    [
      {
        from: { nodeId: "missing", portId: "out" },
        to: { nodeId: "queue.1", portId: "in" },
      },
      "missing_endpoint",
    ],
    [
      {
        from: { nodeId: "source.1", portId: "missing" },
        to: { nodeId: "queue.1", portId: "in" },
      },
      "missing_port",
    ],
  ] as const)(
    "rejects dangling node and port references",
    (endpoints, code) => {
      const source = topology();
      const invalid: ArchitectureTopology = {
        ...source,
        edges: [{ id: "edge.invalid", ...endpoints }],
      };
      expect(
        validateArchitectureTopology(invalid, CORE_CATALOG),
      ).toContainEqual(expect.objectContaining({ path: "edges[0]", code }));
    },
  );

  test("rejects direction, protocol type, and width mismatches", () => {
    const source = topology();
    const direction: ArchitectureTopology = {
      ...source,
      edges: [
        {
          id: "edge.direction",
          from: { nodeId: "queue.1", portId: "in" },
          to: { nodeId: "source.1", portId: "out" },
        },
      ],
    };
    expect(
      validateArchitectureTopology(direction, CORE_CATALOG),
    ).toContainEqual(expect.objectContaining({ code: "invalid_direction" }));

    const protocol: ArchitectureTopology = {
      ...source,
      nodes: [
        source.nodes[0]!,
        source.nodes[3]!,
        {
          ...source.nodes[3]!,
          id: "sram.1",
          definitionId: "core.sram",
          parameters: { banks: 8 },
        },
      ],
      edges: [
        {
          id: "edge.protocol",
          from: { nodeId: "sram.1", portId: "tile-out" },
          to: { nodeId: "vector.1", portId: "issue" },
        },
      ],
    };
    expect(validateArchitectureTopology(protocol, CORE_CATALOG)).toContainEqual(
      expect.objectContaining({ code: "protocol_mismatch" }),
    );

    const definitions = CORE_CATALOG.definitions.map((definition) =>
      definition.id === "core.vector"
        ? {
            ...definition,
            ports: definition.ports.map((port) =>
              port.id === "issue" ? { ...port, widthBits: 64 } : port,
            ),
          }
        : definition,
    );
    expect(
      validateArchitectureTopology(source, {
        ...CORE_CATALOG,
        definitions,
      }),
    ).toContainEqual(expect.objectContaining({ code: "width_mismatch" }));
  });

  test("requires evidence-qualified physical area on every node", () => {
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
      expect.objectContaining({ path: "nodes[0].area", code: "invalid_area" }),
    );
  });
});

describe("topology identity and graph helpers", () => {
  test("fingerprint is canonical and changes with semantic topology", () => {
    const source = topology();
    const fingerprint = topologyFingerprint(source);
    expect(fingerprint).toMatch(/^fnv1a64:[a-f0-9]{16}$/);
    expect(
      topologyFingerprint({
        ...source,
        name: "Display-only rename",
        nodes: [...source.nodes].reverse(),
        edges: [...source.edges].reverse(),
      }),
    ).toBe(fingerprint);
    expect(topologyFingerprint({ ...source, revision: "revision-2" })).not.toBe(
      fingerprint,
    );
  });

  test("indexes hierarchy, typed connections, and Queue-collapsed flow", () => {
    const source = topology();
    expect(
      topologyHierarchy(source).map(({ node, depth }) => [node.id, depth]),
    ).toEqual([
      ["scope.root", 0],
      ["queue.1", 1],
      ["source.1", 1],
      ["vector.1", 1],
    ]);
    const index = topologyConnectionIndex(source);
    expect(index.byNodeId.get("queue.1")?.incoming.map(({ id }) => id)).toEqual(
      ["edge.source-queue"],
    );
    expect(
      topologyConnectionsForNode(source, "queue.1").outgoing.map(
        ({ id }) => id,
      ),
    ).toEqual(["edge.queue-vector"]);
    expect(topologyModuleFlowEdges(source, CORE_CATALOG)).toEqual([
      { fromNodeId: "source.1", toNodeId: "vector.1", queueNodeId: "queue.1" },
    ]);
    expect(stableTopologicalSort(source, CORE_CATALOG).orderedNodeIds).toEqual([
      "source.1",
      "vector.1",
    ]);
  });
});

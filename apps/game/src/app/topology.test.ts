import { readFileSync } from "node:fs";
import { CORE_CATALOG } from "@linxsimcity/component-catalog";
import {
  generateWorldFromTopology,
  validateArchitectureTopology,
} from "@linxsimcity/world";
import { expect, test } from "vitest";

import { parseArchitectureTopology } from "./topology.js";

const generatedTopology = readFileSync(
  new URL(
    "../../public/topologies/davincioo-queue-model.json",
    import.meta.url,
  ),
  "utf8",
);

test("the default scene is generated from the canonical pyCircuit QueueGraph plan", () => {
  const topology = parseArchitectureTopology(generatedTopology);
  expect(validateArchitectureTopology(topology, CORE_CATALOG)).toEqual([]);
  const world = generateWorldFromTopology(topology, CORE_CATALOG);
  expect(topology.source).toMatchObject({
    kind: "agentic-circuit-queue-graph-plan",
    planSchema: "agentic-circuit-queue-graph-plan",
    relevantInputsDirty: false,
  });
  expect(topology.nodes).toHaveLength(39);
  expect(topology.edges).toHaveLength(32);
  expect(world.links.map((link) => link.id)).toEqual(
    topology.edges.map((edge) => edge.id),
  );
});

test("topology import requires the current explicit schema", () => {
  const topology = parseArchitectureTopology(generatedTopology);
  expect(() =>
    parseArchitectureTopology(
      JSON.stringify({ ...topology, schema: "legacy" }),
    ),
  ).toThrow(/topology.*格式/);
});

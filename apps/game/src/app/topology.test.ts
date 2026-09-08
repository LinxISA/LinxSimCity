import { CORE_CATALOG } from "@linxsimcity/component-catalog";
import {
  generateWorldFromTopology,
  validateArchitectureTopology,
} from "@linxsimcity/world";
import { expect, test } from "vitest";

import { createDemoTopology, parseArchitectureTopology } from "./topology.js";

test("the demo scene is generated from one valid topology source", () => {
  const topology = createDemoTopology();
  expect(validateArchitectureTopology(topology, CORE_CATALOG)).toEqual([]);
  const world = generateWorldFromTopology(topology, CORE_CATALOG);
  expect(world.instances).toHaveLength(topology.nodes.length);
  expect(world.links).toHaveLength(topology.edges.length);
  expect(world.links.map((link) => link.id)).toEqual(
    topology.edges.map((edge) => edge.id),
  );
});

test("topology import requires the current explicit schema", () => {
  const topology = createDemoTopology();
  expect(parseArchitectureTopology(JSON.stringify(topology))).toEqual(topology);
  expect(() =>
    parseArchitectureTopology(
      JSON.stringify({ ...topology, schema: "legacy" }),
    ),
  ).toThrow(/topology.*格式/);
});

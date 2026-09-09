import { readFileSync } from "node:fs";
import {
  CORE_CATALOG,
  validateDavinciCatalogMapping,
} from "@linxsimcity/component-catalog";
import {
  generateWorldFromTopology,
  validateArchitectureTopology,
} from "@linxsimcity/world";
import { expect, test } from "vitest";

import { parseArchitectureTopology, parseDavinciCatalog } from "./topology.js";

const generatedTopology = readFileSync(
  new URL(
    "../../public/topologies/davincioo-queue-model.json",
    import.meta.url,
  ),
  "utf8",
);
const generatedCatalog = readFileSync(
  new URL("../../public/catalogs/davincioo-h3.json", import.meta.url),
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

test("the DavinciOO catalog maps all 240 H3 candidates without claiming execution", () => {
  const catalog = parseDavinciCatalog(generatedCatalog);
  expect(validateDavinciCatalogMapping(catalog)).toEqual([]);
  expect(catalog.authority).toBe("catalog-mapping-not-execution-topology");
  expect(catalog.summary).toMatchObject({
    h1: 7,
    h2: 31,
    h3Candidates: 240,
    sourcePresent: 6,
    byRepresentation: {
      module: 125,
      "contained-state": 43,
      interface: 13,
      alias: 21,
      assembly: 1,
      unresolved: 37,
    },
  });
  expect(
    catalog.candidates.filter(
      (candidate) =>
        candidate.reportedExecutionStatus ===
        "implemented-and-verified-in-design-program",
    ),
  ).toHaveLength(3);
  expect(
    catalog.candidates.find(
      (candidate) => candidate.candidateId === "DAV-SPE-IEX-I1-0001",
    ),
  ).toMatchObject({
    representation: "unresolved",
    reportedExecutionStatus: "not-implemented-in-design-program",
    sourcePresentAtRevision: true,
    observedEvidenceStatus: "source-and-test-paths-present",
  });
  expect(
    catalog.candidates.every((candidate) => candidate.area.value === null),
  ).toBe(true);
});

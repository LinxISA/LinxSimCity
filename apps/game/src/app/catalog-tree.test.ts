import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { buildCatalogTree, findCatalogCandidateLocation } from "./App.js";
import { parseDavinciCatalog } from "./topology.js";

const catalog = parseDavinciCatalog(
  readFileSync(
    new URL("../../public/catalogs/davincioo-h3.json", import.meta.url),
    "utf8",
  ),
);

test("catalog tree exposes all 240 candidates through 7 districts and 31 subsystems", () => {
  const tree = buildCatalogTree(catalog.candidates, "");
  const subsystems = tree.flatMap((district) => district.subsystems);
  const candidates = subsystems.flatMap((subsystem) => subsystem.candidates);

  expect(tree).toHaveLength(7);
  expect(subsystems).toHaveLength(31);
  expect(candidates).toHaveLength(240);
  expect(
    new Set(candidates.map((candidate) => candidate.candidateId)).size,
  ).toBe(240);
});

test("search returns matching candidates inside their complete hierarchy path", () => {
  for (const candidate of catalog.candidates) {
    const tree = buildCatalogTree(catalog.candidates, candidate.candidateId);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe(candidate.h1);
    expect(tree[0]?.subsystems).toHaveLength(1);
    expect(tree[0]?.subsystems[0]?.id).toBe(`${candidate.h1}:${candidate.h2}`);
    expect(tree[0]?.subsystems[0]?.candidates).toEqual([candidate]);
  }
});

test("canonical owners resolve to a branch that can be expanded and focused", () => {
  const ownedCandidates = catalog.candidates.filter(
    (candidate) => candidate.ownerCandidateId !== null,
  );

  expect(ownedCandidates.length).toBeGreaterThan(0);
  for (const candidate of ownedCandidates) {
    const location = findCatalogCandidateLocation(
      catalog.candidates,
      candidate.ownerCandidateId!,
    );
    expect(location?.candidate.candidateId).toBe(candidate.ownerCandidateId);
    expect(location?.branchId).toBe(
      `${location?.candidate.h1}:${location?.candidate.h2}`,
    );
  }
});

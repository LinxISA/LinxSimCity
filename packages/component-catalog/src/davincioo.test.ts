import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  buildDavinciCatalogIndex,
  locateDavinciCandidate,
  validateDavinciCatalogMapping,
} from "./davincioo.js";
import type {
  DavinciCandidateMapping,
  DavinciCatalogMapping,
} from "./types.js";

const mapping = JSON.parse(
  readFileSync(
    new URL(
      "../../../apps/game/public/catalogs/davincioo-h3.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as DavinciCatalogMapping;

function replaceCandidates(
  replacements: ReadonlyMap<string, DavinciCandidateMapping>,
): DavinciCatalogMapping {
  return {
    ...mapping,
    candidates: mapping.candidates.map(
      (candidate) => replacements.get(candidate.candidateId) ?? candidate,
    ),
  };
}

describe("DavinciOO catalog index", () => {
  test("locates all 240 candidates in a deterministic 7/31 hierarchy", () => {
    expect(validateDavinciCatalogMapping(mapping)).toEqual([]);
    const index = buildDavinciCatalogIndex(mapping);
    expect(index.h1Groups).toHaveLength(7);
    expect(
      index.h1Groups.reduce((count, h1) => count + h1.h2Groups.length, 0),
    ).toBe(31);
    expect(index.candidates).toHaveLength(240);
    expect(Object.keys(index.candidateById)).toHaveLength(240);

    const locatedIds = new Set<string>();
    for (const h1 of index.h1Groups) {
      for (const h2 of h1.h2Groups) {
        for (const entry of h2.candidates) {
          expect(entry.location.h1).toBe(h1.label);
          expect(entry.location.h2).toBe(h2.label);
          expect(
            locateDavinciCandidate(index, entry.candidate.candidateId),
          ).toBe(entry);
          locatedIds.add(entry.candidate.candidateId);
        }
      }
    }
    expect(locatedIds.size).toBe(240);

    const reversed = buildDavinciCatalogIndex({
      ...mapping,
      candidates: [...mapping.candidates].reverse(),
    });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(index));
  });

  test("keeps ownership canonical without inventing duplicate owners", () => {
    const index = buildDavinciCatalogIndex(mapping);
    const assignedCandidates = index.ownershipGroups.flatMap(
      (group) => group.candidateIds,
    );
    expect(new Set(assignedCandidates).size).toBe(assignedCandidates.length);

    for (const entry of index.candidates) {
      const ownerId = entry.owner.canonicalOwnerCandidateId;
      if (ownerId === null) {
        expect(entry.owner.status).toBe("unresolved");
        expect(entry.capability.presentation).not.toBe("independent-owner");
        continue;
      }
      const owner = locateDavinciCandidate(index, ownerId);
      expect(owner).toBeDefined();
      expect(owner!.owner.status).toBe("self");
      expect(["module", "assembly"]).toContain(owner!.candidate.representation);
      if (entry.owner.status === "self") {
        expect(ownerId).toBe(entry.candidate.candidateId);
      } else {
        expect(entry.capability.presentation).toBe("owned-detail");
      }
      expect(entry.capability.executionCapability).toBe(
        "not-established-by-catalog",
      );
      expect(entry.capability.observedEvidenceStatus).toBe(
        entry.candidate.observedEvidenceStatus,
      );
    }
  });

  test("resolves an owned detail to its canonical independent leaf", () => {
    const alias = mapping.candidates.find(
      (candidate) => candidate.representation === "alias",
    )!;
    const owner = mapping.candidates.find(
      (candidate) => candidate.representation === "module",
    )!;
    const withOwner = replaceCandidates(
      new Map([
        [
          alias.candidateId,
          {
            ...alias,
            ownerStatus: "referenced",
            ownerCandidateId: owner.candidateId,
          },
        ],
      ]),
    );
    expect(validateDavinciCatalogMapping(withOwner)).toEqual([]);
    const entry = locateDavinciCandidate(
      buildDavinciCatalogIndex(withOwner),
      alias.candidateId,
    );
    expect(entry?.owner).toEqual({
      status: "referenced",
      canonicalOwnerCandidateId: owner.candidateId,
    });
    expect(entry?.capability.presentation).toBe("owned-detail");
  });

  test("rejects dangling and cyclic owner references", () => {
    const aliases = mapping.candidates.filter(
      (candidate) => candidate.representation === "alias",
    );
    const left = aliases[0]!;
    const right = aliases[1]!;
    const dangling = replaceCandidates(
      new Map([
        [
          left.candidateId,
          {
            ...left,
            ownerStatus: "referenced",
            ownerCandidateId: "DAV-MISSING-OWNER-0001",
          },
        ],
      ]),
    );
    expect(validateDavinciCatalogMapping(dangling)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "must reference a candidate in this catalog",
        }),
      ]),
    );

    const cyclic = replaceCandidates(
      new Map([
        [
          left.candidateId,
          {
            ...left,
            ownerStatus: "referenced",
            ownerCandidateId: right.candidateId,
          },
        ],
        [
          right.candidateId,
          {
            ...right,
            ownerStatus: "referenced",
            ownerCandidateId: left.candidateId,
          },
        ],
      ]),
    );
    expect(validateDavinciCatalogMapping(cyclic)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "must resolve without cycles to one independent owner",
        }),
      ]),
    );
  });
});

import type {
  CatalogDiagnostic,
  DavinciCatalogMapping,
  DavinciCandidateRepresentation,
} from "./types.js";

const SHA256 = /^[a-f0-9]{64}$/;
const REPRESENTATIONS: readonly DavinciCandidateRepresentation[] = [
  "module",
  "contained-state",
  "interface",
  "alias",
  "assembly",
  "unresolved",
];

export function validateDavinciCatalogMapping(
  mapping: DavinciCatalogMapping,
): CatalogDiagnostic[] {
  const diagnostics: CatalogDiagnostic[] = [];
  if (
    mapping.schema !== "linxsimcity.davincioo-catalog" ||
    mapping.schemaVersion !== "1" ||
    mapping.authority !== "catalog-mapping-not-execution-topology"
  ) {
    diagnostics.push({
      path: "schema",
      message: "must use the current non-executable DavinciOO catalog contract",
    });
  }
  if (
    !mapping.source.repository ||
    !mapping.source.revision ||
    !SHA256.test(mapping.source.catalogSha256) ||
    !SHA256.test(mapping.source.treeManifestSha256)
  ) {
    diagnostics.push({
      path: "source",
      message: "must bind repository, revision, catalog, and tree manifest",
    });
  }
  if (mapping.candidates.length !== 240) {
    diagnostics.push({
      path: "candidates",
      message: "must contain exactly 240 H3 candidates",
    });
  }
  const ids = new Set<string>();
  mapping.candidates.forEach((candidate, index) => {
    const path = `candidates[${index}]`;
    if (!candidate.candidateId || ids.has(candidate.candidateId)) {
      diagnostics.push({
        path: `${path}.candidateId`,
        message: "must be non-empty and unique",
      });
    }
    ids.add(candidate.candidateId);
    if (!REPRESENTATIONS.includes(candidate.representation)) {
      diagnostics.push({
        path: `${path}.representation`,
        message: "is not a supported catalog representation",
      });
    }
    if (
      candidate.area.unit !== "um2" ||
      candidate.area.value !== null ||
      candidate.area.status !== "unknown" ||
      !candidate.area.source
    ) {
      diagnostics.push({
        path: `${path}.area`,
        message:
          "catalog candidates without PPA evidence must be explicit unknown um2",
      });
    }
    if (candidate.sourcePresentAtRevision && !candidate.proposedSource) {
      diagnostics.push({
        path: `${path}.proposedSource`,
        message: "a present source must have a path",
      });
    }
    if (
      candidate.observedEvidenceStatus === "source-and-test-paths-present" &&
      (!candidate.sourcePresentAtRevision ||
        candidate.testPathsAtRevision.length === 0)
    ) {
      diagnostics.push({
        path: `${path}.observedEvidenceStatus`,
        message:
          "source-and-test evidence requires both committed path classes",
      });
    }
    if (
      candidate.observedEvidenceStatus === "source-absent" &&
      candidate.sourcePresentAtRevision
    ) {
      diagnostics.push({
        path: `${path}.observedEvidenceStatus`,
        message: "source-absent conflicts with the committed tree manifest",
      });
    }
    const selfOwned = ["module", "assembly"].includes(candidate.representation);
    if (
      (selfOwned && candidate.ownerStatus !== "self") ||
      (!selfOwned && candidate.ownerStatus !== "unresolved")
    ) {
      diagnostics.push({
        path: `${path}.ownerStatus`,
        message:
          "must reflect whether this catalog row is an independent owner",
      });
    }
  });
  const h1 = new Set(mapping.candidates.map((candidate) => candidate.h1));
  const h2 = new Set(
    mapping.candidates.map((candidate) => `${candidate.h1}.${candidate.h2}`),
  );
  if (h1.size !== 7 || h2.size !== 31) {
    diagnostics.push({
      path: "summary",
      message: "must preserve the 7 H1 and 31 H2 hierarchy",
    });
  }
  const representationCounts = Object.fromEntries(
    REPRESENTATIONS.map((representation) => [
      representation,
      mapping.candidates.filter(
        (candidate) => candidate.representation === representation,
      ).length,
    ]),
  );
  const byH1 = Object.fromEntries(
    [...h1]
      .sort()
      .map((group) => [
        group,
        mapping.candidates.filter((candidate) => candidate.h1 === group).length,
      ]),
  );
  if (
    mapping.summary.h1 !== h1.size ||
    mapping.summary.h2 !== h2.size ||
    mapping.summary.h3Candidates !== mapping.candidates.length ||
    mapping.summary.sourcePresent !==
      mapping.candidates.filter(
        (candidate) => candidate.sourcePresentAtRevision,
      ).length ||
    REPRESENTATIONS.some(
      (representation) =>
        mapping.summary.byRepresentation[representation] !==
        representationCounts[representation],
    ) ||
    Object.keys(byH1).some(
      (group) => mapping.summary.byH1[group] !== byH1[group],
    )
  ) {
    diagnostics.push({
      path: "summary",
      message: "does not match candidate contents",
    });
  }
  return diagnostics;
}

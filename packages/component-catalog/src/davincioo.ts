import type {
  CatalogDiagnostic,
  DavinciCapabilityEvidence,
  DavinciCatalogIndex,
  DavinciCatalogIndexEntry,
  DavinciCatalogMapping,
  DavinciCandidateMapping,
  DavinciCandidateRepresentation,
  DavinciOwnerResolution,
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

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const isIndependentOwner = (candidate: DavinciCandidateMapping): boolean =>
  candidate.representation === "module" ||
  candidate.representation === "assembly";

function resolveOwner(
  candidate: DavinciCandidateMapping,
  candidateById: ReadonlyMap<string, DavinciCandidateMapping>,
): DavinciOwnerResolution {
  if (candidate.ownerStatus === "unresolved") {
    return { status: "unresolved", canonicalOwnerCandidateId: null };
  }
  const referenced = candidate.ownerCandidateId;
  if (referenced === null) {
    return { status: "unresolved", canonicalOwnerCandidateId: null };
  }
  let owner = candidateById.get(referenced);
  const visited = new Set([candidate.candidateId]);
  while (owner && owner.ownerStatus === "referenced") {
    if (visited.has(owner.candidateId) || owner.ownerCandidateId === null) {
      return { status: "unresolved", canonicalOwnerCandidateId: null };
    }
    visited.add(owner.candidateId);
    owner = candidateById.get(owner.ownerCandidateId);
  }
  if (
    !owner ||
    owner.ownerStatus !== "self" ||
    owner.ownerCandidateId !== owner.candidateId ||
    !isIndependentOwner(owner)
  ) {
    return { status: "unresolved", canonicalOwnerCandidateId: null };
  }
  return {
    status: owner.candidateId === candidate.candidateId ? "self" : "referenced",
    canonicalOwnerCandidateId: owner.candidateId,
  };
}

function capabilityFor(
  candidate: DavinciCandidateMapping,
  owner: DavinciOwnerResolution,
): DavinciCapabilityEvidence {
  const presentation =
    owner.status === "self"
      ? "independent-owner"
      : owner.status === "referenced"
        ? "owned-detail"
        : candidate.representation === "contained-state"
          ? "contained-state"
          : candidate.representation === "interface"
            ? "interface-only"
            : candidate.representation === "alias"
              ? "catalog-alias"
              : "unresolved";
  return {
    presentation,
    observedEvidenceStatus: candidate.observedEvidenceStatus,
    reportedExecutionStatus: candidate.reportedExecutionStatus,
    executionCapability: "not-established-by-catalog",
  };
}

export function buildDavinciCatalogIndex(
  mapping: DavinciCatalogMapping,
): DavinciCatalogIndex {
  const diagnostics = validateDavinciCatalogMapping(mapping);
  if (diagnostics.length > 0) {
    throw new Error(`${diagnostics[0]!.path}: ${diagnostics[0]!.message}`);
  }
  const candidates = [...mapping.candidates].sort((left, right) =>
    compareText(left.candidateId, right.candidateId),
  );
  const sourceById = new Map(
    candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const h1Labels = [
    ...new Set(candidates.map((candidate) => candidate.h1)),
  ].sort(compareText);
  const h2LabelsByH1 = new Map(
    h1Labels.map((h1) => [
      h1,
      [
        ...new Set(
          candidates
            .filter((candidate) => candidate.h1 === h1)
            .map((candidate) => candidate.h2),
        ),
      ].sort(compareText),
    ]),
  );
  const entries: DavinciCatalogIndexEntry[] = [];
  const h1Groups = h1Labels.map((h1, h1Index) => ({
    id: h1,
    label: h1,
    h2Groups: h2LabelsByH1.get(h1)!.map((h2, h2Index) => ({
      id: `${h1}.${h2}`,
      label: h2,
      candidates: candidates
        .filter((candidate) => candidate.h1 === h1 && candidate.h2 === h2)
        .map((candidate, candidateIndex) => {
          const owner = resolveOwner(candidate, sourceById);
          const entry: DavinciCatalogIndexEntry = {
            candidate,
            location: { h1Index, h2Index, candidateIndex, h1, h2 },
            owner,
            capability: capabilityFor(candidate, owner),
          };
          entries.push(entry);
          return entry;
        }),
    })),
  }));
  const candidateById = Object.fromEntries(
    entries.map((entry) => [entry.candidate.candidateId, entry]),
  );
  const ownerIds = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.owner.canonicalOwnerCandidateId === null
          ? []
          : [entry.owner.canonicalOwnerCandidateId],
      ),
    ),
  ].sort(compareText);
  return {
    h1Groups,
    candidates: entries,
    candidateById,
    ownershipGroups: ownerIds.map((ownerCandidateId) => ({
      ownerCandidateId,
      candidateIds: entries
        .filter(
          (entry) => entry.owner.canonicalOwnerCandidateId === ownerCandidateId,
        )
        .map((entry) => entry.candidate.candidateId)
        .sort(compareText),
    })),
  };
}

export function locateDavinciCandidate(
  index: DavinciCatalogIndex,
  candidateId: string,
): DavinciCatalogIndexEntry | undefined {
  return index.candidateById[candidateId];
}

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
    const selfOwned = isIndependentOwner(candidate);
    if (
      (selfOwned &&
        (candidate.ownerStatus !== "self" ||
          candidate.ownerCandidateId !== candidate.candidateId)) ||
      (!selfOwned && candidate.ownerStatus === "self") ||
      (candidate.ownerStatus === "referenced" &&
        candidate.ownerCandidateId === null) ||
      (candidate.ownerStatus === "unresolved" &&
        candidate.ownerCandidateId !== null)
    ) {
      diagnostics.push({
        path: `${path}.ownerCandidateId`,
        message:
          "must identify self, a referenced owner, or explicit unresolved ownership",
      });
    }
  });
  const candidateById = new Map(
    mapping.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  mapping.candidates.forEach((candidate, index) => {
    if (
      candidate.ownerCandidateId !== null &&
      !candidateById.has(candidate.ownerCandidateId)
    ) {
      diagnostics.push({
        path: `candidates[${index}].ownerCandidateId`,
        message: "must reference a candidate in this catalog",
      });
      return;
    }
    if (candidate.ownerStatus !== "unresolved") {
      const resolution = resolveOwner(candidate, candidateById);
      if (resolution.canonicalOwnerCandidateId === null) {
        diagnostics.push({
          path: `candidates[${index}].ownerCandidateId`,
          message: "must resolve without cycles to one independent owner",
        });
      }
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

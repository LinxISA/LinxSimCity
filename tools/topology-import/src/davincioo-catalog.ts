import { validateDavinciCatalogMapping } from "@linxsimcity/component-catalog";
import type {
  DavinciCatalogMapping,
  DavinciCandidateMapping,
  DavinciCandidatePort,
  DavinciCandidateRepresentation,
} from "@linxsimcity/component-catalog";

import type { DavinciCatalogProvenance } from "./types.js";

const REPRESENTATION_BY_DISPOSITION: Readonly<
  Record<string, DavinciCandidateRepresentation>
> = {
  leaf: "module",
  state_schema: "contained-state",
  interface: "interface",
  alias: "alias",
  assembly: "assembly",
  review: "unresolved",
};

interface RawPort {
  readonly name: string;
  readonly type: string;
  readonly meaning: string;
  readonly status: "declared" | "proposed" | "unresolved";
}

interface RawCandidate {
  readonly candidate_id: string;
  readonly h1: string;
  readonly h2: string;
  readonly h3: string;
  readonly name: string;
  readonly disposition_recommendation: string;
  readonly rationale: string;
  readonly source_candidate_status: string;
  readonly source_candidate_disposition: string;
  readonly execution_status: string;
  readonly proposed_source: string;
  readonly card: string;
  readonly inputs: readonly RawPort[];
  readonly outputs: readonly RawPort[];
}

interface RawCatalog {
  readonly modules: readonly RawCandidate[];
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(
  value: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const field = value[key];
  if (typeof field !== "string")
    throw new Error(`${path}.${key} must be a string`);
  return field;
}

function parsePort(value: unknown, path: string): RawPort {
  if (!record(value)) throw new Error(`${path} must be an object`);
  const status = stringField(value, "status", path);
  if (!["declared", "proposed", "unresolved"].includes(status)) {
    throw new Error(`${path}.status is unsupported`);
  }
  return {
    name: stringField(value, "name", path),
    type: stringField(value, "type", path),
    meaning: stringField(value, "meaning", path),
    status: status as RawPort["status"],
  };
}

function parseCandidate(value: unknown, index: number): RawCandidate {
  const path = `modules[${index}]`;
  if (!record(value)) throw new Error(`${path} must be an object`);
  const inputs = value.inputs;
  const outputs = value.outputs;
  if (!Array.isArray(inputs) || !Array.isArray(outputs)) {
    throw new Error(`${path}.inputs and outputs must be arrays`);
  }
  return {
    candidate_id: stringField(value, "candidate_id", path),
    h1: stringField(value, "h1", path),
    h2: stringField(value, "h2", path),
    h3: stringField(value, "h3", path),
    name: stringField(value, "name", path),
    disposition_recommendation: stringField(
      value,
      "disposition_recommendation",
      path,
    ),
    rationale: stringField(value, "rationale", path),
    source_candidate_status: stringField(
      value,
      "source_candidate_status",
      path,
    ),
    source_candidate_disposition: stringField(
      value,
      "source_candidate_disposition",
      path,
    ),
    execution_status: stringField(value, "execution_status", path),
    proposed_source: stringField(value, "proposed_source", path),
    card: stringField(value, "card", path),
    inputs: inputs.map((port, portIndex) =>
      parsePort(port, `${path}.inputs[${portIndex}]`),
    ),
    outputs: outputs.map((port, portIndex) =>
      parsePort(port, `${path}.outputs[${portIndex}]`),
    ),
  };
}

export function parseDavinciSourceCatalog(value: unknown): RawCatalog {
  if (!record(value) || !Array.isArray(value.modules)) {
    throw new Error("DavinciOO catalog must contain a modules array");
  }
  return { modules: value.modules.map(parseCandidate) };
}

export function representationForDisposition(
  disposition: string,
): DavinciCandidateRepresentation {
  const representation = REPRESENTATION_BY_DISPOSITION[disposition];
  if (!representation) {
    throw new Error(`unsupported DavinciOO disposition ${disposition}`);
  }
  return representation;
}

function mapPort(port: RawPort): DavinciCandidatePort {
  return {
    name: port.name,
    type: port.type,
    meaning: port.meaning,
    evidenceStatus: port.status,
  };
}

export function convertDavinciCatalog(
  catalog: RawCatalog,
  treePaths: ReadonlySet<string>,
  provenance: DavinciCatalogProvenance,
): DavinciCatalogMapping {
  const candidates: DavinciCandidateMapping[] = catalog.modules
    .map((candidate) => {
      const representation = representationForDisposition(
        candidate.disposition_recommendation,
      );
      const selfOwned = ["module", "assembly"].includes(representation);
      const sourcePresentAtRevision = treePaths.has(candidate.proposed_source);
      const sourceBase = candidate.proposed_source
        .split("/")
        .at(-1)!
        .replace(/\.py$/, "")
        .toLowerCase();
      const testPathsAtRevision = sourcePresentAtRevision
        ? [...treePaths]
            .filter(
              (path) =>
                path.startsWith("designs/davincioo/tests/") &&
                path.endsWith(".py") &&
                path.split("/").at(-1)!.toLowerCase().includes(sourceBase),
            )
            .sort()
        : [];
      const observedEvidenceStatus = sourcePresentAtRevision
        ? testPathsAtRevision.length > 0
          ? "source-and-test-paths-present"
          : "source-present-no-test-path"
        : selfOwned
          ? "source-absent"
          : "not-applicable";
      return {
        candidateId: candidate.candidate_id,
        h1: candidate.h1,
        h2: candidate.h2,
        h3: candidate.h3,
        name: candidate.name,
        representation,
        dispositionRecommendation: candidate.disposition_recommendation,
        rationale: candidate.rationale,
        sourceCandidateStatus: candidate.source_candidate_status,
        sourceCandidateDisposition: candidate.source_candidate_disposition,
        reportedExecutionStatus: candidate.execution_status,
        proposedSource: candidate.proposed_source,
        sourcePresentAtRevision,
        testPathsAtRevision,
        observedEvidenceStatus,
        card: candidate.card,
        ownerCandidateId: selfOwned ? candidate.candidate_id : null,
        ownerStatus: selfOwned ? "self" : "unresolved",
        inputs: candidate.inputs.map(mapPort),
        outputs: candidate.outputs.map(mapPort),
        area: {
          value: null,
          unit: "um2",
          status: "unknown",
          source: "davincioo-catalog:no-ppa-area",
        },
      } satisfies DavinciCandidateMapping;
    })
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const representations = Object.keys(REPRESENTATION_BY_DISPOSITION).map(
    representationForDisposition,
  );
  const uniqueRepresentations = [...new Set(representations)];
  const mapping: DavinciCatalogMapping = {
    schema: "linxsimcity.davincioo-catalog",
    schemaVersion: "1",
    authority: "catalog-mapping-not-execution-topology",
    source: {
      repository: provenance.repository,
      revision: provenance.revision,
      catalogPath: provenance.catalogPath,
      catalogSha256: provenance.catalogSha256,
      treeManifestSha256: provenance.treeManifestSha256,
    },
    summary: {
      h1: new Set(candidates.map((candidate) => candidate.h1)).size,
      h2: new Set(
        candidates.map((candidate) => `${candidate.h1}.${candidate.h2}`),
      ).size,
      h3Candidates: candidates.length,
      byH1: Object.fromEntries(
        [...new Set(candidates.map((candidate) => candidate.h1))]
          .sort()
          .map((h1) => [
            h1,
            candidates.filter((candidate) => candidate.h1 === h1).length,
          ]),
      ),
      byRepresentation: Object.fromEntries(
        uniqueRepresentations.map((representation) => [
          representation,
          candidates.filter(
            (candidate) => candidate.representation === representation,
          ).length,
        ]),
      ) as DavinciCatalogMapping["summary"]["byRepresentation"],
      sourcePresent: candidates.filter(
        (candidate) => candidate.sourcePresentAtRevision,
      ).length,
    },
    candidates,
  };
  const diagnostics = validateDavinciCatalogMapping(mapping);
  if (diagnostics.length > 0) {
    throw new Error(`${diagnostics[0]!.path}: ${diagnostics[0]!.message}`);
  }
  return mapping;
}

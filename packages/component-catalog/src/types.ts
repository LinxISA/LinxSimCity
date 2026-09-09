export const BRICK_KINDS = [
  "queue",
  "table",
  "sram",
  "register-file",
  "alu",
  "vector",
  "cube",
  "tma",
  "arbiter",
  "crossbar",
  "container",
  "io",
] as const;

export type BrickKind = (typeof BRICK_KINDS)[number];

export const BRICK_VISUAL_PROFILES = [
  "queue-pipe",
  "table-linear",
  "table-matrix",
  "rob-circular",
  "memory-banks",
  "tma-memory",
  "compute",
  "switch",
  "district",
  "interface",
] as const;

export type BrickVisualProfile = (typeof BRICK_VISUAL_PROFILES)[number];

export interface BrickVisualDefinition {
  readonly profile: BrickVisualProfile;
  readonly dimensionParameters?: readonly string[];
  readonly maxVisibleEntries?: number;
}

export const PORT_PROTOCOLS = [
  "transaction",
  "tile",
  "control",
  "completion",
  "metadata",
] as const;

export type PortProtocol = (typeof PORT_PROTOCOLS)[number];
export type PortDirection = "input" | "output" | "bidirectional";

export interface BrickSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PhysicalArea {
  readonly value: number | null;
  readonly unit: "um2";
  readonly status: "measured" | "estimated" | "aggregate" | "unknown";
  readonly source: string;
}

export type DavinciCandidateRepresentation =
  | "module"
  | "contained-state"
  | "interface"
  | "alias"
  | "assembly"
  | "unresolved";

export interface DavinciCandidatePort {
  readonly name: string;
  readonly type: string;
  readonly meaning: string;
  readonly evidenceStatus: "declared" | "proposed" | "unresolved";
}

export interface DavinciCandidateMapping {
  readonly candidateId: string;
  readonly h1: string;
  readonly h2: string;
  readonly h3: string;
  readonly name: string;
  readonly representation: DavinciCandidateRepresentation;
  readonly dispositionRecommendation: string;
  readonly rationale: string;
  readonly sourceCandidateStatus: string;
  readonly sourceCandidateDisposition: string;
  readonly reportedExecutionStatus: string;
  readonly proposedSource: string;
  readonly sourcePresentAtRevision: boolean;
  readonly testPathsAtRevision: readonly string[];
  readonly observedEvidenceStatus:
    | "source-and-test-paths-present"
    | "source-present-no-test-path"
    | "source-absent"
    | "not-applicable";
  readonly card: string;
  readonly ownerCandidateId: string | null;
  readonly ownerStatus: "self" | "referenced" | "unresolved";
  readonly inputs: readonly DavinciCandidatePort[];
  readonly outputs: readonly DavinciCandidatePort[];
  readonly area: PhysicalArea;
}

export type DavinciOwnerResolutionStatus = "self" | "referenced" | "unresolved";

export type DavinciPresentationCapability =
  | "independent-owner"
  | "owned-detail"
  | "contained-state"
  | "interface-only"
  | "catalog-alias"
  | "unresolved";

export interface DavinciCapabilityEvidence {
  readonly presentation: DavinciPresentationCapability;
  readonly observedEvidenceStatus: DavinciCandidateMapping["observedEvidenceStatus"];
  readonly reportedExecutionStatus: string;
  readonly executionCapability: "not-established-by-catalog";
}

export interface DavinciOwnerResolution {
  readonly status: DavinciOwnerResolutionStatus;
  readonly canonicalOwnerCandidateId: string | null;
}

export interface DavinciCandidateLocation {
  readonly h1Index: number;
  readonly h2Index: number;
  readonly candidateIndex: number;
  readonly h1: string;
  readonly h2: string;
}

export interface DavinciCatalogIndexEntry {
  readonly candidate: DavinciCandidateMapping;
  readonly location: DavinciCandidateLocation;
  readonly owner: DavinciOwnerResolution;
  readonly capability: DavinciCapabilityEvidence;
}

export interface DavinciCatalogH2Group {
  readonly id: string;
  readonly label: string;
  readonly candidates: readonly DavinciCatalogIndexEntry[];
}

export interface DavinciCatalogH1Group {
  readonly id: string;
  readonly label: string;
  readonly h2Groups: readonly DavinciCatalogH2Group[];
}

export interface DavinciOwnershipGroup {
  readonly ownerCandidateId: string;
  readonly candidateIds: readonly string[];
}

export interface DavinciCatalogIndex {
  readonly h1Groups: readonly DavinciCatalogH1Group[];
  readonly candidates: readonly DavinciCatalogIndexEntry[];
  readonly candidateById: Readonly<Record<string, DavinciCatalogIndexEntry>>;
  readonly ownershipGroups: readonly DavinciOwnershipGroup[];
}

export interface DavinciCatalogMapping {
  readonly schema: "linxsimcity.davincioo-catalog";
  readonly schemaVersion: "1";
  readonly authority: "catalog-mapping-not-execution-topology";
  readonly source: {
    readonly repository: string;
    readonly revision: string;
    readonly catalogPath: string;
    readonly catalogSha256: string;
    readonly treeManifestSha256: string;
  };
  readonly summary: {
    readonly h1: number;
    readonly h2: number;
    readonly h3Candidates: number;
    readonly byH1: Readonly<Record<string, number>>;
    readonly byRepresentation: Readonly<
      Record<DavinciCandidateRepresentation, number>
    >;
    readonly sourcePresent: number;
  };
  readonly candidates: readonly DavinciCandidateMapping[];
}

export interface BrickPortDefinition {
  readonly id: string;
  readonly label: string;
  readonly direction: PortDirection;
  readonly protocol: PortProtocol;
  readonly widthBits: number | null;
  readonly anchor: readonly [number, number, number];
  readonly cardinality: "one" | "many";
}

export interface IntegerParameterDefinition {
  readonly kind: "integer";
  readonly label: string;
  readonly default: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
}

export type BrickParameterDefinition = IntegerParameterDefinition;

export interface BrickSource {
  readonly repository: string;
  readonly revision: string;
  readonly candidateId?: string;
}

export interface BrickDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: BrickKind;
  readonly description: string;
  readonly size: BrickSize;
  readonly ports: readonly BrickPortDefinition[];
  readonly parameters: Readonly<Record<string, BrickParameterDefinition>>;
  readonly visual: BrickVisualDefinition;
  readonly source?: BrickSource;
}

export interface ComponentCatalog {
  readonly schema: "linxsimcity.component-catalog";
  readonly schemaVersion: "1";
  readonly definitions: readonly BrickDefinition[];
}

export interface CatalogDiagnostic {
  readonly path: string;
  readonly message: string;
}

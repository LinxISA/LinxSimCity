export const BRICK_KINDS = [
  "queue",
  "table",
  "sram",
  "register-file",
  "alu",
  "vector",
  "cube",
  "arbiter",
  "crossbar",
  "container",
  "io",
] as const;

export type BrickKind = (typeof BRICK_KINDS)[number];

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
  readonly ownerStatus: "self" | "unresolved";
  readonly inputs: readonly DavinciCandidatePort[];
  readonly outputs: readonly DavinciCandidatePort[];
  readonly area: PhysicalArea;
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

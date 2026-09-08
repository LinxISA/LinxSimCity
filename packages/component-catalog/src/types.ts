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

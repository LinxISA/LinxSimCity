export const TOPOLOGY_ENTITY_KINDS = [
  "module",
  "cache-line",
  "rob-slot",
  "queue-slot",
  "register",
  "cell",
  "xbar-lane",
  "cube-mac",
  "stgbufb-subspace",
  "pipe",
] as const;

export type TopologyEntityKind = (typeof TOPOLOGY_ENTITY_KINDS)[number];

export interface TopologyPort {
  id: string;
  direction: "in" | "out" | "inout";
  widthBytes?: number;
}

export interface TopologyPlacement {
  district: string;
  order?: number;
  row?: number;
  column?: number;
}

export interface TopologyEntity {
  id: string;
  kind: TopologyEntityKind;
  parentId?: string;
  label: string;
  instance: Record<string, number | string>;
  capacity?: number;
  ports?: TopologyPort[];
  placement?: TopologyPlacement;
  attributes?: Record<string, number | string | boolean>;
}

export interface TopologyDescriptor {
  schemaVersion: string;
  entities: TopologyEntity[];
}

export type DiagnosticCode =
  | "duplicate_entity_id"
  | "missing_parent"
  | "invalid_capacity"
  | "missing_entity_reference"
  | "instance_out_of_range";

export interface Diagnostic {
  severity: "error" | "warning";
  code: DiagnosticCode;
  path: string;
  message: string;
}

export interface ValidationResult {
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

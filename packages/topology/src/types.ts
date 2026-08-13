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

export type TopologyVector3 = [number, number, number];

export interface TopologyDistrict {
  id: string;
  position: TopologyVector3;
  size: TopologyVector3;
}

export interface TopologyLayout {
  schema: "linx-city-v1";
  units: "scene-unit";
  upAxis: "y";
  forwardAxis: "-z";
  districts: TopologyDistrict[];
}

export interface TopologyPort {
  id: string;
  direction: "in" | "out" | "inout";
  widthBytes?: number;
  position?: TopologyVector3;
}

export interface TopologyPlacement {
  district: string;
  thread?: number;
  position?: TopologyVector3;
  size?: TopologyVector3;
  rotation?: TopologyVector3;
  order?: number;
  row?: number;
  column?: number;
  lodGroup?: string;
}

export interface TopologyRoute {
  style: "orthogonal";
  fromPortId: string;
  toPortId: string;
  points: TopologyVector3[];
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
  route?: TopologyRoute;
  attributes?: Record<string, number | string | boolean>;
}

export interface TopologyDescriptor {
  schemaVersion: string;
  layout?: TopologyLayout;
  entities: TopologyEntity[];
}

export type DiagnosticCode =
  | "duplicate_entity_id"
  | "missing_parent"
  | "invalid_capacity"
  | "missing_entity_reference"
  | "instance_out_of_range"
  | "invalid_layout"
  | "invalid_placement"
  | "placement_out_of_bounds"
  | "missing_port_reference"
  | "invalid_route";

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

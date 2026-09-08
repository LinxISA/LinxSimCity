import type { BrickSize, PhysicalArea } from "@linxsimcity/component-catalog";

export const WORLD_CHUNK_SIZE = 64;

export interface AxisPosition {
  readonly chunk: number;
  readonly local: number;
}

export interface WorldPosition {
  readonly x: AxisPosition;
  readonly y: AxisPosition;
  readonly z: AxisPosition;
}

export interface BrickTransform {
  readonly position: WorldPosition;
  readonly yawRadians: number;
}

export interface BrickInstance {
  readonly id: string;
  readonly definitionId: string;
  readonly label?: string;
  readonly transform: BrickTransform;
  readonly parameters: Readonly<Record<string, number>>;
  readonly visualSize?: BrickSize;
  readonly hierarchyDepth: number;
  readonly topologyRank: number;
  readonly topologyOrder: number;
  readonly laneId: string;
}

export interface TopologyEndpoint {
  readonly nodeId: string;
  readonly portId: string;
}

export interface TopologyNode {
  readonly id: string;
  readonly definitionId: string;
  readonly label?: string;
  readonly parentId?: string;
  readonly parameters: Readonly<Record<string, number>>;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
  readonly area: PhysicalArea;
}

export interface TopologyEdge {
  readonly id: string;
  readonly from: TopologyEndpoint;
  readonly to: TopologyEndpoint;
}

export interface ArchitectureTopology {
  readonly schema: "linxsimcity.topology";
  readonly schemaVersion: "1";
  readonly id: string;
  readonly name: string;
  readonly revision: string;
  readonly source?: TopologySource;
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyEdge[];
}

export interface TopologySource {
  readonly kind: string;
  readonly repository: string;
  readonly revision: string;
  readonly worktreeDirty: boolean;
  readonly relevantInputsDirty: boolean;
  readonly planSchema: string;
  readonly planVersion: string;
  readonly planSha256: string;
  readonly modelSha256: string;
}

export interface WorldLinkEndpoint {
  readonly instanceId: string;
  readonly portId: string;
}

export interface WorldLink {
  readonly id: string;
  readonly from: WorldLinkEndpoint;
  readonly to: WorldLinkEndpoint;
}

export interface GeneratedWorld {
  readonly schema: "linxsimcity.generated-world";
  readonly schemaVersion: "1";
  readonly topologyId: string;
  readonly topologyRevision: string;
  readonly topologyFingerprint: string;
  readonly name: string;
  readonly instances: readonly BrickInstance[];
  readonly links: readonly WorldLink[];
}

export interface TopologyDiagnostic {
  readonly path: string;
  readonly code:
    | "duplicate_id"
    | "missing_definition"
    | "invalid_parameter"
    | "missing_endpoint"
    | "missing_port"
    | "invalid_direction"
    | "protocol_mismatch"
    | "width_mismatch"
    | "input_already_connected"
    | "invalid_parent"
    | "invalid_source"
    | "invalid_area";
  readonly message: string;
}

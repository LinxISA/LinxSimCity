import type { PhysicalArea } from "@linxsimcity/component-catalog";

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

export type TopologyDiagnosticCode =
  | "invalid_schema"
  | "missing_field"
  | "invalid_type"
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

export interface TopologyDiagnostic {
  readonly path: string;
  readonly code: TopologyDiagnosticCode;
  readonly message: string;
}

export interface TopologyHierarchyEntry {
  readonly node: TopologyNode;
  readonly depth: number;
}

export interface TopologyNodeConnections {
  readonly incoming: readonly TopologyEdge[];
  readonly outgoing: readonly TopologyEdge[];
}

export interface TopologyConnectionIndex {
  readonly byNodeId: ReadonlyMap<string, TopologyNodeConnections>;
  readonly byPort: ReadonlyMap<string, readonly TopologyEdge[]>;
}

export interface TopologyModuleFlowEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly queueNodeId?: string;
}

export interface TopologicalSortResult {
  readonly orderedNodeIds: readonly string[];
  readonly rankByNodeId: ReadonlyMap<string, number>;
  readonly cyclicNodeIds: readonly string[];
  readonly rankCount: number;
}

export type { PhysicalArea } from "@linxsimcity/component-catalog";

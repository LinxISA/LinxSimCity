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
  readonly yawQuarterTurns: 0 | 1 | 2 | 3;
}

export interface BrickInstance {
  readonly id: string;
  readonly definitionId: string;
  readonly label?: string;
  readonly transform: BrickTransform;
  readonly parameters: Readonly<Record<string, number>>;
}

export interface LinkEndpoint {
  readonly instanceId: string;
  readonly portId: string;
}

export interface BlueprintLink {
  readonly id: string;
  readonly from: LinkEndpoint;
  readonly to: LinkEndpoint;
}

export interface Blueprint {
  readonly schema: "linxsimcity.blueprint";
  readonly schemaVersion: "1";
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly instances: readonly BrickInstance[];
  readonly links: readonly BlueprintLink[];
}

export interface BlueprintDiagnostic {
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
    | "invalid_position";
  readonly message: string;
}

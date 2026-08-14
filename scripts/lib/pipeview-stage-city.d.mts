import type {
  TopologyDescriptor,
  TopologyDistrict,
  TopologyVector3,
} from "../../packages/topology/src/types.js";

export type PipeviewStageDomain =
  | "scalar"
  | "scalarMemory"
  | "vector"
  | "cube"
  | "acccvt"
  | "tlsu"
  | "tileBridge";

export interface StageRect {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

export interface PackedStageBuilding {
  readonly stage: string;
  readonly order: number;
  readonly row: number;
  readonly column: number;
  readonly position: TopologyVector3;
  readonly size: TopologyVector3;
}

export const PIPEVIEW_DISTRICTS: Readonly<
  Record<
    "scalar" | "vector" | "cell" | "cube" | "tlsu" | "sharedTileRegister",
    TopologyDistrict
  >
>;

export const PIPEVIEW_STAGE_DOMAINS: Readonly<
  Record<PipeviewStageDomain, readonly string[]>
>;

export function packStageBuildings(options: {
  readonly rect: StageRect;
  readonly stages: readonly string[];
  readonly columns: number;
  readonly gap?: number;
}): readonly PackedStageBuilding[];

export function enrichPipeviewStageCity(
  topology: TopologyDescriptor,
): TopologyDescriptor;

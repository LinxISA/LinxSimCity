import type { TopologyDescriptor } from "@linxsimcity/topology";

export interface Rect3 {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

export type DistrictId =
  "scalar" | "vector" | "cell" | "cube" | "stgbufb" | "tlsu";

export interface ResolvedDistrict extends Rect3 {
  readonly id: DistrictId;
  readonly label: string;
  readonly color: string;
}

export interface PeRowLayout {
  readonly pe: number;
  readonly cell: Rect3;
  readonly cube: Rect3;
}

export interface ResolvedLayout {
  readonly core: Rect3;
  readonly districts: readonly ResolvedDistrict[];
  readonly peRows: readonly PeRowLayout[];
  readonly topology: TopologyDescriptor;
}

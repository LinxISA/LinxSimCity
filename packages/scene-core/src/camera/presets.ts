import type { DistrictId } from "../layout/types.js";

export type CameraFocus = "city" | DistrictId;

export interface CameraPreset {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export const CAMERA_PRESETS: Readonly<Record<CameraFocus, CameraPreset>> = {
  city: { position: [-2, 104, 102], target: [-10, 0, 5] },
  scalar: { position: [-51, 42, 22], target: [-65, 0, -3] },
  vector: { position: [-31, 42, 22], target: [-48, 0, -3] },
  cell: { position: [-10, 46, 28], target: [-26, 0, -3] },
  cube: { position: [28, 49, 32], target: [20, 0, -3] },
  stgbufb: { position: [25, 30, 44], target: [24, 0, 22] },
  tlsu: { position: [-5, 42, 66], target: [-9, 0, 33] },
};

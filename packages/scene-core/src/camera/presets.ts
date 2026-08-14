import type { DistrictId } from "../layout/types.js";

export type CameraFocus = "city" | DistrictId;

export interface CameraPreset {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export function visibleWidthAtTarget(
  preset: CameraPreset,
  verticalFovDegrees: number,
  aspect: number,
): number {
  const distance = Math.hypot(
    preset.position[0] - preset.target[0],
    preset.position[1] - preset.target[1],
    preset.position[2] - preset.target[2],
  );
  const verticalFov = (verticalFovDegrees * Math.PI) / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  return 2 * distance * Math.tan(horizontalFov / 2);
}

export const CAMERA_PRESETS: Readonly<Record<CameraFocus, CameraPreset>> = {
  city: { position: [0, 160, 170], target: [0, 0, 0] },
  scalar: { position: [-93.5, 70, 45], target: [-93.5, 0, -12] },
  vector: { position: [-50.5, 72, 48], target: [-50.5, 0, -12] },
  cell: { position: [-2.5, 78, 55], target: [-2.5, 0, -12] },
  cube: { position: [72, 82, 58], target: [72, 0, -12] },
  stgbufb: { position: [72, 45, 82], target: [72, 0, 49] },
  tlsu: { position: [-45.5, 48, 85], target: [-45.5, 0, 49] },
};

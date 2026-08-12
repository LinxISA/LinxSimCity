import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";

import { CAMERA_PRESETS, type CameraFocus } from "./presets.js";

interface CameraControllerProps {
  readonly focus: CameraFocus;
}

const target = new Vector3();

export function CameraController({ focus }: CameraControllerProps) {
  const camera = useThree((state) => state.camera);
  const transitioning = useRef(true);
  useEffect(() => {
    transitioning.current = true;
  }, [focus]);
  useFrame((_state, delta) => {
    if (!transitioning.current) return;
    const preset = CAMERA_PRESETS[focus];
    target.set(...preset.position);
    camera.position.lerp(target, 1 - Math.exp(-4.5 * delta));
    if (camera.position.distanceTo(target) < 0.06) {
      camera.position.copy(target);
      transitioning.current = false;
    }
  });
  return null;
}

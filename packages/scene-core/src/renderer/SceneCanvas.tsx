import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, type ReactNode } from "react";

import { CameraController } from "../camera/CameraController.js";
import { CAMERA_PRESETS, type CameraFocus } from "../camera/presets.js";

interface SceneCanvasProps {
  readonly children: ReactNode;
  readonly focus?: CameraFocus;
  readonly onBlankClick?: () => void;
}

export function SceneCanvas({
  children,
  focus = "city",
  onBlankClick,
}: SceneCanvasProps) {
  return (
    <Canvas
      camera={{ position: [-2, 104, 102], fov: 38, near: 0.1, far: 600 }}
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      }}
      {...(onBlankClick ? { onPointerMissed: onBlankClick } : {})}
      shadows="percentage"
    >
      <color attach="background" args={["#030812"]} />
      <fog attach="fog" args={["#030812", 100, 210]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[-20, 70, 30]} intensity={2.2} castShadow />
      <pointLight position={[35, 22, -15]} intensity={80} color="#2b9dff" />
      <Suspense fallback={null}>{children}</Suspense>
      <CameraController focus={focus} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxDistance={190}
        minDistance={22}
        maxPolarAngle={Math.PI / 2.18}
        target={CAMERA_PRESETS[focus].target}
      />
    </Canvas>
  );
}

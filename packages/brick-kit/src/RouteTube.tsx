import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import { CatmullRomCurve3, Quaternion, Vector3 } from "three";

interface RouteTubeProps {
  readonly points: readonly (readonly [number, number, number])[];
  readonly queue: boolean;
  readonly selected: boolean;
  readonly onSelect?: () => void;
}

export function RouteTube({
  points,
  queue,
  selected,
  onSelect,
}: RouteTubeProps) {
  const { curve, arrowPosition, arrowQuaternion } = useMemo(() => {
    const nextCurve = new CatmullRomCurve3(
      points.map((point) => new Vector3(...point)),
      false,
      "catmullrom",
      0.045,
    );
    const position = nextCurve.getPointAt(0.62);
    const tangent = nextCurve.getTangentAt(0.62).normalize();
    const quaternion = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      tangent,
    );
    return {
      curve: nextCurve,
      arrowPosition: position,
      arrowQuaternion: quaternion,
    };
  }, [points]);
  const pick = (event: ThreeEvent<MouseEvent>) => {
    if (!onSelect) return;
    event.stopPropagation();
    onSelect();
  };
  const outerRadius = queue ? 0.26 : 0.11;
  return (
    <group onClick={pick}>
      <mesh castShadow={queue}>
        <tubeGeometry
          args={[
            curve,
            Math.max(24, points.length * 12),
            outerRadius,
            10,
            false,
          ]}
        />
        <meshPhysicalMaterial
          color={queue ? "#246c68" : "#2a6278"}
          emissive={queue ? "#0f504a" : "#0e3546"}
          emissiveIntensity={selected ? 0.8 : queue ? 0.3 : 0.18}
          metalness={0.62}
          roughness={0.24}
          clearcoat={0.78}
          transparent
          opacity={queue ? 0.88 : 0.72}
        />
      </mesh>
      <mesh>
        <tubeGeometry
          args={[
            curve,
            Math.max(24, points.length * 12),
            queue ? 0.075 : 0.032,
            8,
            false,
          ]}
        />
        <meshStandardMaterial
          color={queue ? "#a0ffeb" : "#84dbff"}
          emissive={queue ? "#38eac4" : "#3ca7d3"}
          emissiveIntensity={selected ? 1.5 : queue ? 0.86 : 0.48}
          transparent
          opacity={0.94}
        />
      </mesh>
      <mesh position={arrowPosition} quaternion={arrowQuaternion}>
        <coneGeometry args={[queue ? 0.22 : 0.13, queue ? 0.62 : 0.38, 12]} />
        <meshStandardMaterial
          color={queue ? "#e2fff8" : "#c2efff"}
          emissive={queue ? "#45e8c8" : "#389abe"}
          emissiveIntensity={1.05}
        />
      </mesh>
    </group>
  );
}

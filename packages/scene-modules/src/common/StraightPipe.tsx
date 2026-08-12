import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";

interface StraightPipeProps {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly color: string;
  readonly radius?: number;
  readonly opacity?: number;
}

export function StraightPipe({
  from,
  to,
  color,
  radius = 0.12,
  opacity = 1,
}: StraightPipeProps) {
  const geometry = useMemo(() => {
    const start = new Vector3(...from);
    const end = new Vector3(...to);
    const direction = end.clone().sub(start);
    const length = direction.length();
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const quaternion = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      direction.normalize(),
    );
    return { length, midpoint, quaternion };
  }, [from, to]);

  return (
    <mesh position={geometry.midpoint} quaternion={geometry.quaternion}>
      <cylinderGeometry args={[radius, radius, geometry.length, 8]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.85}
        transparent={opacity < 1}
        opacity={opacity}
        metalness={0.35}
        roughness={0.28}
      />
    </mesh>
  );
}

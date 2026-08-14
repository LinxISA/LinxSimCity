import { Html } from "@react-three/drei";

interface DistrictFrameProps {
  readonly label: string;
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly color: string;
}

export function DistrictFrame({
  label,
  center,
  size,
  color,
}: DistrictFrameProps) {
  const [x, , z] = center;
  const [width, , depth] = size;
  return (
    <group>
      <mesh position={[x, 0.04, z]} receiveShadow>
        <boxGeometry args={[width, 0.08, depth]} />
        <meshStandardMaterial
          color="#07121f"
          emissive={color}
          emissiveIntensity={0.035}
          metalness={0.35}
          roughness={0.74}
        />
      </mesh>
      <Html
        position={[x - width / 2 + 0.6, 0.14, z - depth / 2 + 0.5]}
        distanceFactor={38}
        style={{ pointerEvents: "none" }}
      >
        <span className="district-label" style={{ color }}>
          {label}
        </span>
      </Html>
    </group>
  );
}

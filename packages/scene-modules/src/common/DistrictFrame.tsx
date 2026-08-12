import { Html } from "@react-three/drei";

interface DistrictFrameProps {
  readonly label: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly color: string;
}

export function DistrictFrame({
  label,
  x,
  z,
  width,
  depth,
  color,
}: DistrictFrameProps) {
  return (
    <group>
      <mesh position={[x + width / 2, 0.04, z + depth / 2]} receiveShadow>
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
        position={[x + 0.6, 0.14, z + 0.5]}
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

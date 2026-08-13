import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ColorRepresentation } from "three";

interface BuildingProps {
  readonly id?: string | undefined;
  readonly label?: string | undefined;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly color: ColorRepresentation;
  readonly emissive?: ColorRepresentation | undefined;
  readonly emissiveIntensity?: number | undefined;
  readonly labelScale?: number;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function Building({
  id,
  label,
  position,
  size,
  color,
  emissive = color,
  emissiveIntensity = 0.1,
  labelScale = 0.72,
  onSelect,
}: BuildingProps) {
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (id) onSelect?.(id);
  };
  return (
    <group position={position}>
      <mesh
        castShadow
        receiveShadow
        userData={{ entityId: id }}
        onClick={select}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          metalness={0.5}
          roughness={0.42}
        />
      </mesh>
      {label ? (
        <Html
          center
          position={[0, size[1] / 2 + 0.16, 0]}
          distanceFactor={34 / labelScale}
          style={{ pointerEvents: "none" }}
        >
          <span className="scene-label">{label}</span>
        </Html>
      ) : null}
    </group>
  );
}

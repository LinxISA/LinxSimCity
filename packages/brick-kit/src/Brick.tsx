import type {
  BrickDefinition,
  BrickKind,
} from "@linxsimcity/component-catalog";
import type { BrickInstance } from "@linxsimcity/world";
import { positionToTuple } from "@linxsimcity/world";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import { DoubleSide } from "three";

const KIND_COLORS: Record<BrickKind, string> = {
  queue: "#3ad6c6",
  table: "#7aa8ff",
  sram: "#40a4ff",
  "register-file": "#6b78e8",
  alu: "#ffb35c",
  vector: "#e67c48",
  cube: "#ff715b",
  arbiter: "#d08aff",
  crossbar: "#aa72ff",
  container: "#62768a",
};

function Interior({ definition }: { readonly definition: BrickDefinition }) {
  const { x, y, z } = definition.size;
  switch (definition.kind) {
    case "queue":
      return (
        <group position={[0, y * 0.14, 0]}>
          {[-1.5, -0.5, 0.5, 1.5].map((slot) => (
            <mesh key={slot} position={[slot * (x / 5), 0, 0]}>
              <boxGeometry args={[x / 6, y * 0.28, z * 0.58]} />
              <meshStandardMaterial
                color="#7ff7e5"
                metalness={0.38}
                roughness={0.27}
              />
            </mesh>
          ))}
        </group>
      );
    case "table":
      return (
        <group position={[0, y * 0.03, z * 0.11]}>
          {[-1, 0, 1].map((row) =>
            [-1, 0, 1].map((column) => (
              <mesh
                key={`${row}:${column}`}
                position={[column * x * 0.23, row * y * 0.17, 0]}
              >
                <boxGeometry args={[x * 0.17, y * 0.11, z * 0.12]} />
                <meshStandardMaterial
                  color="#9bb9ff"
                  emissive="#234891"
                  emissiveIntensity={0.18}
                />
              </mesh>
            )),
          )}
        </group>
      );
    case "sram":
    case "register-file":
      return (
        <group position={[0, y * 0.18, 0]}>
          {[-1.5, -0.5, 0.5, 1.5].map((bank) => (
            <mesh key={bank} position={[bank * (x / 4.8), 0, 0]}>
              <boxGeometry args={[x / 6, y * 0.55, z * 0.62]} />
              <meshStandardMaterial
                color="#68b4ff"
                metalness={0.62}
                roughness={0.24}
              />
            </mesh>
          ))}
        </group>
      );
    case "alu":
    case "arbiter":
      return (
        <mesh position={[0, y * 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry
            args={[
              Math.min(x, z) * 0.27,
              Math.min(x, z) * 0.36,
              y * 0.55,
              definition.kind === "alu" ? 6 : 12,
            ]}
          />
          <meshStandardMaterial
            color={KIND_COLORS[definition.kind]}
            metalness={0.72}
            roughness={0.22}
          />
        </mesh>
      );
    case "vector":
      return (
        <group position={[0, y * 0.14, 0]}>
          {[-1.5, -0.5, 0.5, 1.5].map((lane) => (
            <mesh key={lane} position={[0, 0, lane * (z / 5)]}>
              <boxGeometry args={[x * 0.72, y * 0.42, z / 8]} />
              <meshStandardMaterial
                color="#ff9f5d"
                metalness={0.6}
                roughness={0.22}
              />
            </mesh>
          ))}
        </group>
      );
    case "cube":
      return (
        <group position={[0, y * 0.13, 0]}>
          {[-1, 0, 1].map((row) =>
            [-1, 0, 1].map((column) => (
              <mesh
                key={`${row}:${column}`}
                position={[column * x * 0.2, 0, row * z * 0.2]}
              >
                <boxGeometry args={[x * 0.14, y * 0.42, z * 0.14]} />
                <meshStandardMaterial
                  color="#ff8268"
                  emissive="#802316"
                  emissiveIntensity={0.28}
                  metalness={0.64}
                  roughness={0.19}
                />
              </mesh>
            )),
          )}
        </group>
      );
    case "crossbar":
      return (
        <group position={[0, y * 0.16, 0]}>
          {[-1, 0, 1].map((lane) => (
            <group key={lane}>
              <mesh position={[0, lane * y * 0.12, lane * z * 0.2]}>
                <boxGeometry args={[x * 0.72, y * 0.08, z * 0.1]} />
                <meshStandardMaterial
                  color="#c496ff"
                  emissive="#522580"
                  emissiveIntensity={0.24}
                />
              </mesh>
              <mesh position={[lane * x * 0.2, lane * y * 0.12, 0]}>
                <boxGeometry args={[x * 0.1, y * 0.08, z * 0.72]} />
                <meshStandardMaterial
                  color="#c496ff"
                  emissive="#522580"
                  emissiveIntensity={0.24}
                />
              </mesh>
            </group>
          ))}
        </group>
      );
    case "container":
      return (
        <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[Math.min(x, z) * 0.31, Math.min(x, z) * 0.34, 4]}
          />
          <meshStandardMaterial color="#7890a4" side={DoubleSide} />
        </mesh>
      );
  }
}

export interface BrickProps {
  readonly instance: BrickInstance;
  readonly definition: BrickDefinition;
  readonly selected: boolean;
  readonly onSelect: (instanceId: string) => void;
}

export function Brick({
  instance,
  definition,
  selected,
  onSelect,
}: BrickProps) {
  const position = positionToTuple(instance.transform.position);
  const color = KIND_COLORS[definition.kind];
  const emissive = selected ? "#bdeaff" : "#07141e";
  const rotation = useMemo(
    () => [0, instance.transform.yawQuarterTurns * (Math.PI / 2), 0] as const,
    [instance.transform.yawQuarterTurns],
  );
  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(instance.id);
  };
  return (
    <group
      position={[position[0], position[1], position[2]]}
      rotation={rotation}
      onClick={pick}
    >
      <mesh position={[0, 0.18, 0]} receiveShadow castShadow>
        <boxGeometry
          args={[definition.size.x + 0.36, 0.36, definition.size.z + 0.36]}
        />
        <meshStandardMaterial
          color="#101c27"
          metalness={0.82}
          roughness={0.36}
        />
      </mesh>
      <mesh position={[0, definition.size.y / 2, 0]} receiveShadow castShadow>
        <boxGeometry
          args={[definition.size.x, definition.size.y, definition.size.z]}
        />
        <meshPhysicalMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={selected ? 0.52 : 0.05}
          metalness={0.58}
          roughness={0.3}
          clearcoat={0.65}
          clearcoatRoughness={0.22}
          transparent
          opacity={definition.kind === "container" ? 0.38 : 0.88}
        />
      </mesh>
      <Interior definition={definition} />
      {definition.ports.map((port) => (
        <mesh
          key={port.id}
          position={[
            port.anchor[0],
            definition.size.y / 2 + port.anchor[1],
            port.anchor[2],
          ]}
        >
          <sphereGeometry args={[0.18, 16, 12]} />
          <meshStandardMaterial
            color={
              port.direction === "input"
                ? "#69dcff"
                : port.direction === "output"
                  ? "#ffcf68"
                  : "#d49cff"
            }
            emissive={port.direction === "input" ? "#176b8a" : "#845d12"}
            emissiveIntensity={0.65}
          />
        </mesh>
      ))}
      {selected ? (
        <mesh position={[0, definition.size.y / 2, 0]}>
          <boxGeometry
            args={[
              definition.size.x + 0.24,
              definition.size.y + 0.24,
              definition.size.z + 0.24,
            ]}
          />
          <meshBasicMaterial
            color="#d7f7ff"
            wireframe
            transparent
            opacity={0.8}
          />
        </mesh>
      ) : null}
    </group>
  );
}

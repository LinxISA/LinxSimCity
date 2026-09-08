import type { BrickSize } from "@linxsimcity/component-catalog";
import { Html, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, MeshStandardMaterial } from "three";

function pulse(intensity: number): number {
  return 0.18 + Math.pow(Math.max(0, intensity), 6) * 2.6;
}

export function SystolicArray({ size }: { readonly size: BrickSize }) {
  const materials = useRef<(MeshStandardMaterial | null)[]>([]);
  const dimension = 4;
  const cells = Array.from({ length: dimension * dimension }, (_, index) => ({
    row: Math.floor(index / dimension),
    column: index % dimension,
  }));
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime() * 2.15;
    materials.current.forEach((material, index) => {
      if (!material) return;
      const row = Math.floor(index / dimension);
      const column = index % dimension;
      material.emissiveIntensity = pulse(
        Math.sin(time - row * 0.72 - column * 0.58),
      );
    });
  });
  const stepX = (size.x * 0.62) / (dimension - 1);
  const stepZ = (size.z * 0.58) / (dimension - 1);
  const y = size.y * 0.93;
  return (
    <group>
      <Html position={[0, y + 0.72, 0]} center distanceFactor={12}>
        <span className="engine-label engine-cube-label">4×4 SYSTOLIC</span>
      </Html>
      {Array.from({ length: dimension }, (_, row) => (
        <RoundedBox
          key={`row-${row}`}
          position={[0, y - 0.16, (row - 1.5) * stepZ]}
          args={[size.x * 0.72, 0.08, 0.1]}
          radius={0.03}
          smoothness={2}
        >
          <meshStandardMaterial
            color="#712d24"
            emissive="#ff704f"
            emissiveIntensity={0.3}
            metalness={0.72}
          />
        </RoundedBox>
      ))}
      {Array.from({ length: dimension }, (_, column) => (
        <RoundedBox
          key={`column-${column}`}
          position={[(column - 1.5) * stepX, y - 0.16, 0]}
          args={[0.1, 0.08, size.z * 0.68]}
          radius={0.03}
          smoothness={2}
        >
          <meshStandardMaterial
            color="#712d24"
            emissive="#ff704f"
            emissiveIntensity={0.3}
            metalness={0.72}
          />
        </RoundedBox>
      ))}
      {cells.map(({ row, column }, index) => (
        <RoundedBox
          key={`${row}:${column}`}
          position={[(column - 1.5) * stepX, y, (row - 1.5) * stepZ]}
          args={[size.x * 0.12, 0.5, size.z * 0.12]}
          radius={0.11}
          smoothness={3}
          castShadow
        >
          <meshStandardMaterial
            ref={(material) => {
              materials.current[index] = material;
            }}
            color="#ff8d68"
            emissive="#ff4d32"
            emissiveIntensity={0.2}
            metalness={0.58}
            roughness={0.18}
          />
        </RoundedBox>
      ))}
    </group>
  );
}

export function VectorMacArray({ size }: { readonly size: BrickSize }) {
  const materials = useRef<(MeshStandardMaterial | null)[]>([]);
  const lanes = 8;
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime() * 2.6;
    materials.current.forEach((material, index) => {
      if (!material) return;
      material.emissiveIntensity = pulse(Math.sin(time - index * 0.54));
    });
  });
  const step = (size.x * 0.76) / (lanes - 1);
  const cellWidth = Math.min(0.72, step * 0.72);
  const y = size.y * 0.92;
  return (
    <group>
      <Html position={[0, y + 0.62, 0]} center distanceFactor={12}>
        <span className="engine-label engine-vector-label">8× MAC</span>
      </Html>
      <RoundedBox
        position={[0, y - 0.25, 0]}
        args={[size.x * 0.86, 0.18, size.z * 0.54]}
        radius={0.08}
        smoothness={3}
      >
        <meshStandardMaterial
          color="#211712"
          metalness={0.78}
          roughness={0.26}
        />
      </RoundedBox>
      {Array.from({ length: lanes }, (_, index) => (
        <group key={index} position={[(index - 3.5) * step, y, 0]}>
          <RoundedBox
            args={[cellWidth, 0.56, size.z * 0.34]}
            radius={0.1}
            smoothness={3}
            castShadow
          >
            <meshStandardMaterial
              ref={(material) => {
                materials.current[index] = material;
              }}
              color="#ffb06c"
              emissive="#ee682e"
              emissiveIntensity={0.2}
              metalness={0.58}
              roughness={0.18}
            />
          </RoundedBox>
          <mesh position={[0, 0.3, 0]}>
            <torusGeometry args={[cellWidth * 0.2, 0.035, 6, 12]} />
            <meshBasicMaterial color="#fff1c7" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function TmaMemoryEngine({ size }: { readonly size: BrickSize }) {
  const packets = useRef<(Group | null)[]>([]);
  const lanes = 4;
  const left = -size.x * 0.25;
  const right = size.x * 0.27;
  const y = size.y * 0.9;
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime() * 0.72;
    packets.current.forEach((packet, index) => {
      if (!packet) return;
      const phase = (time + index / lanes) % 2;
      const progress = phase <= 1 ? phase : 2 - phase;
      packet.position.x = left + (right - left) * progress;
    });
  });
  return (
    <group>
      <Html position={[left, y + 0.8, 0]} center distanceFactor={12}>
        <span className="engine-label engine-tma-label">TMA</span>
      </Html>
      <Html position={[right, y + 1.15, 0]} center distanceFactor={12}>
        <span className="engine-label engine-ddr-label">DDR</span>
      </Html>
      <RoundedBox
        position={[left, y, 0]}
        args={[size.x * 0.28, 0.76, size.z * 0.62]}
        radius={0.16}
        smoothness={3}
      >
        <meshStandardMaterial
          color="#55dfb0"
          emissive="#16885f"
          emissiveIntensity={0.55}
          metalness={0.6}
          roughness={0.2}
        />
      </RoundedBox>
      {Array.from({ length: lanes }, (_, index) => {
        const z = (index - 1.5) * size.z * 0.15;
        return (
          <group key={index}>
            <RoundedBox
              position={[(left + right) / 2, y, z]}
              args={[right - left, 0.11, 0.13]}
              radius={0.04}
              smoothness={2}
            >
              <meshStandardMaterial
                color="#2d8fbb"
                emissive="#30cfff"
                emissiveIntensity={0.72}
                metalness={0.5}
              />
            </RoundedBox>
            <group
              ref={(packet) => {
                packets.current[index] = packet;
              }}
              position={[left, y + 0.16, z]}
            >
              <mesh>
                <boxGeometry args={[0.34, 0.22, 0.22]} />
                <meshStandardMaterial
                  color="#e9ffff"
                  emissive="#57e6ff"
                  emissiveIntensity={2.8}
                />
              </mesh>
              <mesh scale={1.7}>
                <boxGeometry args={[0.34, 0.22, 0.22]} />
                <meshBasicMaterial
                  color="#37ccff"
                  transparent
                  opacity={0.13}
                  depthWrite={false}
                />
              </mesh>
            </group>
          </group>
        );
      })}
      <group position={[right, y, 0]}>
        {Array.from({ length: 4 }, (_, index) => (
          <RoundedBox
            key={index}
            position={[0, (index - 1.5) * 0.42, 0]}
            args={[size.x * 0.2, 0.3, size.z * 0.7]}
            radius={0.07}
            smoothness={2}
          >
            <meshStandardMaterial
              color="#55749b"
              emissive={index % 2 === 0 ? "#2e9acc" : "#1b3454"}
              emissiveIntensity={index % 2 === 0 ? 0.52 : 0.12}
              metalness={0.72}
              roughness={0.26}
            />
          </RoundedBox>
        ))}
      </group>
    </group>
  );
}

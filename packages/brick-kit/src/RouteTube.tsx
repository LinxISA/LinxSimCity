import { Html, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Mesh } from "three";
import { Quaternion, Vector3 } from "three";

import type { BrickActivity } from "./entry-layout.js";

interface RouteTubeProps {
  readonly points: readonly (readonly [number, number, number])[];
  readonly queue: boolean;
  readonly selected: boolean;
  readonly activity?: BrickActivity;
  readonly label?: string;
  readonly onSelect?: () => void;
}

interface RouteSegment {
  readonly start: Vector3;
  readonly end: Vector3;
  readonly midpoint: Vector3;
  readonly direction: Vector3;
  readonly length: number;
  readonly scale: readonly [number, number, number];
}

function routeSegments(
  points: readonly (readonly [number, number, number])[],
  thickness: number,
): readonly RouteSegment[] {
  const result: RouteSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = new Vector3(...points[index - 1]!);
    const end = new Vector3(...points[index]!);
    const delta = end.clone().sub(start);
    const length = delta.length();
    if (length < 0.001) continue;
    const direction = delta.clone().normalize();
    const axis = [Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z)];
    const dominant = axis.indexOf(Math.max(...axis));
    result.push({
      start,
      end,
      midpoint: start.clone().add(end).multiplyScalar(0.5),
      direction,
      length,
      scale:
        dominant === 0
          ? [length, thickness, thickness]
          : dominant === 1
            ? [thickness, length, thickness]
            : [thickness, thickness, length],
    });
  }
  return result;
}

function pointAlongRoute(
  segments: readonly RouteSegment[],
  progress: number,
): Vector3 {
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = progress * total;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      return segment.start
        .clone()
        .lerp(segment.end, remaining / Math.max(segment.length, 0.001));
    }
    remaining -= segment.length;
  }
  return segments.at(-1)?.end.clone() ?? new Vector3();
}

function FlowPackets({
  segments,
  count,
}: {
  readonly segments: readonly RouteSegment[];
  readonly count: number;
}) {
  const refs = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const phase = clock.getElapsedTime() * 0.115;
    refs.current.forEach((mesh, index) => {
      if (!mesh) return;
      const point = pointAlongRoute(segments, (phase + index / count) % 1);
      mesh.position.copy(point);
    });
  });
  return Array.from({ length: count }, (_, index) => (
    <mesh
      key={index}
      ref={(mesh) => {
        refs.current[index] = mesh;
      }}
    >
      <boxGeometry args={[0.32, 0.2, 0.2]} />
      <meshStandardMaterial
        color="#d8fff7"
        emissive="#49f4d0"
        emissiveIntensity={1.8}
        roughness={0.16}
      />
    </mesh>
  ));
}

export function RouteTube({
  points,
  queue,
  selected,
  activity,
  label,
  onSelect,
}: RouteTubeProps) {
  const thickness = queue ? 0.58 : 0.24;
  const segments = useMemo(
    () => routeSegments(points, thickness),
    [points, thickness],
  );
  const arrow = useMemo(() => {
    const segment = [...segments].sort(
      (left, right) => right.length - left.length,
    )[0];
    if (!segment) return undefined;
    return {
      position: segment.midpoint,
      quaternion: new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        segment.direction,
      ),
    };
  }, [segments]);
  const labelPosition = useMemo(
    () => pointAlongRoute(segments, 0.5),
    [segments],
  );
  const pick = (event: ThreeEvent<MouseEvent>) => {
    if (!onSelect) return;
    event.stopPropagation();
    onSelect();
  };
  const occupiedEntries = activity?.occupiedEntries ?? 0;
  const flowCount =
    queue && occupiedEntries > 0
      ? Math.max(1, Math.min(4, Math.ceil(occupiedEntries / 3)))
      : 0;
  return (
    <group onClick={pick}>
      {segments.map((segment, index) => (
        <group key={index}>
          <RoundedBox
            position={segment.midpoint}
            args={[...segment.scale]}
            radius={queue ? 0.09 : 0.04}
            smoothness={2}
            castShadow={queue}
          >
            <meshPhysicalMaterial
              color={queue ? "#1e625d" : "#285f73"}
              emissive={queue ? "#0d4944" : "#0d3040"}
              emissiveIntensity={selected ? 0.8 : queue ? 0.24 : 0.14}
              metalness={0.64}
              roughness={0.24}
              clearcoat={0.76}
              transparent
              opacity={queue ? 0.82 : 0.68}
            />
          </RoundedBox>
          <RoundedBox
            position={segment.midpoint}
            args={[
              Math.max(
                0.07,
                segment.scale[0] -
                  (segment.scale[0] === thickness ? thickness * 0.72 : 0),
              ),
              Math.max(
                0.07,
                segment.scale[1] -
                  (segment.scale[1] === thickness ? thickness * 0.72 : 0),
              ),
              Math.max(
                0.07,
                segment.scale[2] -
                  (segment.scale[2] === thickness ? thickness * 0.72 : 0),
              ),
            ]}
            radius={0.025}
            smoothness={2}
          >
            <meshStandardMaterial
              color={queue ? "#86f4dc" : "#83d9f7"}
              emissive={queue ? "#2bc7a9" : "#2f91b4"}
              emissiveIntensity={selected ? 1.2 : queue ? 0.52 : 0.32}
              transparent
              opacity={0.52}
            />
          </RoundedBox>
        </group>
      ))}
      {queue ? <FlowPackets segments={segments} count={flowCount} /> : null}
      {arrow ? (
        <mesh position={arrow.position} quaternion={arrow.quaternion}>
          <coneGeometry args={[queue ? 0.28 : 0.14, queue ? 0.72 : 0.4, 4]} />
          <meshStandardMaterial
            color={queue ? "#e2fff8" : "#c2efff"}
            emissive={queue ? "#45e8c8" : "#389abe"}
            emissiveIntensity={1.05}
          />
        </mesh>
      ) : null}
      {selected && label ? (
        <Html position={labelPosition} center>
          <span className="queue-label">{label}</span>
        </Html>
      ) : null}
    </group>
  );
}

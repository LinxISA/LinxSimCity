import { Html, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { AdditiveBlending, Quaternion, Vector3 } from "three";

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
  const refs = useRef<(Group | null)[]>([]);
  useFrame(({ clock }) => {
    const phase = clock.getElapsedTime() * 0.115;
    refs.current.forEach((packet, index) => {
      if (!packet) return;
      const point = pointAlongRoute(segments, (phase + index / count) % 1);
      packet.position.copy(point);
    });
  });
  return Array.from({ length: count }, (_, index) => (
    <group
      key={index}
      ref={(packet) => {
        refs.current[index] = packet;
      }}
    >
      <mesh>
        <boxGeometry args={[0.42, 0.25, 0.25]} />
        <meshStandardMaterial
          color="#f0fffb"
          emissive="#48ffd7"
          emissiveIntensity={3.2}
          roughness={0.1}
        />
      </mesh>
      <mesh scale={1.9}>
        <boxGeometry args={[0.42, 0.25, 0.25]} />
        <meshBasicMaterial
          color="#42ffd2"
          transparent
          opacity={0.17}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
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
              color={queue ? "#58b7ac" : "#438ca8"}
              emissive={queue ? "#0b3c38" : "#0c2a37"}
              emissiveIntensity={selected ? 0.42 : queue ? 0.1 : 0.08}
              metalness={0.2}
              roughness={0.12}
              clearcoat={0.9}
              transmission={queue ? 0.72 : 0.42}
              thickness={0.22}
              transparent
              opacity={selected ? 0.42 : queue ? 0.24 : 0.32}
              depthWrite={false}
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

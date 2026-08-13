import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Mesh, Vector3 } from "three";

import { orthogonalRoute, type Point3 } from "./orthogonal-route.js";
import { tokenColor, tokenOverlay } from "./thread-colors.js";

function payloadRecord(event: EventEnvelope): Record<string, unknown> {
  return event.payload as Record<string, unknown>;
}

function payloadString(
  event: EventEnvelope,
  field: string,
): string | undefined {
  const value = payloadRecord(event)[field];
  return typeof value === "string" ? value : undefined;
}

function legacyRoute(event: EventEnvelope): readonly Point3[] {
  if (event.entity_id.includes("stgbufb") || event.type === "cube.dispatch") {
    return orthogonalRoute([18, 2.6, 22], [18, 2.6, -28], "z-first").flatMap(
      (segment, index) =>
        index === 0 ? [segment.from, segment.to] : [segment.to],
    );
  }
  if (event.type.startsWith("cell.") || event.type.startsWith("crossbar.")) {
    return orthogonalRoute([-36, 2.35, -4], [49, 2.35, -4], "x-first").flatMap(
      (segment, index) =>
        index === 0 ? [segment.from, segment.to] : [segment.to],
    );
  }
  if (event.type.startsWith("memory.")) {
    return orthogonalRoute([-60, 2.6, 33], [30, 2.6, 33], "x-first").flatMap(
      (segment, index) =>
        index === 0 ? [segment.from, segment.to] : [segment.to],
    );
  }
  return orthogonalRoute([-68, 2.6, -18], [-68, 2.6, 18], "z-first").flatMap(
    (segment, index) =>
      index === 0 ? [segment.from, segment.to] : [segment.to],
  );
}

export function routePointsForEvent(
  event: EventEnvelope,
  topology: TopologyDescriptor,
): readonly Point3[] | undefined {
  const byId = new Map(topology.entities.map((entity) => [entity.id, entity]));
  const routeId = payloadString(event, "route_id") ?? event.entity_id;
  const route = byId.get(routeId)?.route;
  if (route) return route.points;

  const source = payloadString(event, "source_entity_id");
  const destination = payloadString(event, "destination_entity_id");
  const sourcePosition = source
    ? byId.get(source)?.placement?.position
    : undefined;
  const destinationPosition = destination
    ? byId.get(destination)?.placement?.position
    : undefined;
  if (sourcePosition && destinationPosition) {
    const segments = orthogonalRoute(
      sourcePosition,
      destinationPosition,
      "x-first",
    );
    return segments.flatMap((segment, index) =>
      index === 0 ? [segment.from, segment.to] : [segment.to],
    );
  }
  return topology.layout ? undefined : legacyRoute(event);
}

function routePosition(
  points: readonly Point3[],
  progress: number,
  target: Vector3,
): Vector3 {
  const lengths = points
    .slice(1)
    .map((point, index) =>
      Math.hypot(
        point[0] - points[index]![0],
        point[1] - points[index]![1],
        point[2] - points[index]![2],
      ),
    );
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let distance = Math.max(0, Math.min(1, progress)) * total;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (distance <= length || index === lengths.length - 1) {
      const start = new Vector3(...points[index]!);
      const end = new Vector3(...points[index + 1]!);
      return target.lerpVectors(
        start,
        end,
        length === 0 ? 1 : distance / length,
      );
    }
    distance -= length;
  }
  return target.set(...points.at(-1)!);
}

function TokenGeometry({ event }: { readonly event: EventEnvelope }) {
  if (event.type.startsWith("memory.") || event.type.startsWith("cache.")) {
    return <boxGeometry args={[0.52, 0.28, 0.34]} />;
  }
  if (event.type.startsWith("cube.")) {
    return <octahedronGeometry args={[0.34, 0]} />;
  }
  if (event.type.startsWith("cell.") || event.type.startsWith("crossbar.")) {
    return <cylinderGeometry args={[0.24, 0.24, 0.42, 8]} />;
  }
  return <sphereGeometry args={[0.27, 12, 8]} />;
}

function DataToken({
  event,
  points,
  index,
  onSelect,
  onSelectInstruction,
}: {
  readonly event: EventEnvelope;
  readonly points: readonly Point3[];
  readonly index: number;
  readonly onSelect?: ((entityId: string) => void) | undefined;
  readonly onSelectInstruction?: ((instructionId: number) => void) | undefined;
}) {
  const mesh = useRef<Mesh>(null);
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ clock }) => {
    const progress = (clock.elapsedTime * 0.5 + index * 0.13) % 1;
    mesh.current?.position.copy(routePosition(points, progress, point));
  });
  const color = tokenColor(event);
  const overlay = tokenOverlay(event);
  const select = (threeEvent: ThreeEvent<MouseEvent>) => {
    threeEvent.stopPropagation();
    const instructionId = payloadRecord(event).instruction_id;
    if (typeof instructionId === "number") onSelectInstruction?.(instructionId);
    onSelect?.(event.entity_id);
  };
  return (
    <mesh ref={mesh} onClick={select} userData={{ traceEvent: event }}>
      <TokenGeometry event={event} />
      <meshBasicMaterial
        color={color}
        toneMapped={false}
        wireframe={overlay !== "normal"}
      />
      <pointLight
        color={color}
        intensity={overlay === "normal" ? 2.2 : 4}
        distance={4}
      />
    </mesh>
  );
}

export function DataTokenLayer({
  events,
  topology,
  onSelect,
  onSelectInstruction,
}: {
  readonly events: readonly EventEnvelope[];
  readonly topology: TopologyDescriptor;
  readonly onSelect?: ((entityId: string) => void) | undefined;
  readonly onSelectInstruction?: ((instructionId: number) => void) | undefined;
}) {
  const visible = events.flatMap((event) => {
    const points = routePointsForEvent(event, topology);
    return points && points.length >= 2 ? [{ event, points }] : [];
  });
  return (
    <group>
      {visible.map(({ event, points }, index) => (
        <DataToken
          key={`${event.cycle}-${event.seq}-${event.entity_id}`}
          event={event}
          points={points}
          index={index}
          onSelect={onSelect}
          onSelectInstruction={onSelectInstruction}
        />
      ))}
    </group>
  );
}

import type { EventEnvelope } from "@linxsimcity/trace-schema";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Mesh, Vector3 } from "three";

import { orthogonalRoute, type Point3 } from "./orthogonal-route.js";

function routeFor(
  event: EventEnvelope,
): readonly { from: Point3; to: Point3 }[] {
  if (event.entity_id.includes("stgbufb") || event.type === "cube.dispatch") {
    return orthogonalRoute([18, 2.6, 22], [18, 2.6, -28], "z-first");
  }
  if (
    event.type === "cell.read" ||
    event.type === "cell.write" ||
    event.type === "crossbar.grant"
  ) {
    return orthogonalRoute([-36, 2.35, -4], [49, 2.35, -4], "x-first");
  }
  if (event.type === "memory.request" || event.type === "memory.response") {
    return orthogonalRoute([-60, 2.6, 33], [30, 2.6, 33], "x-first");
  }
  return orthogonalRoute([-68, 2.6, -18], [-68, 2.6, 18], "z-first");
}

function DataToken({ event, index }: { event: EventEnvelope; index: number }) {
  const mesh = useRef<Mesh>(null);
  const route = useMemo(() => routeFor(event), [event]);
  const from = useMemo(() => new Vector3(...route[0]!.from), [route]);
  const to = useMemo(() => new Vector3(...route.at(-1)!.to), [route]);
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ clock }) => {
    const progress = (clock.elapsedTime * 0.55 + index * 0.17) % 1;
    point.lerpVectors(from, to, progress);
    mesh.current?.position.copy(point);
  });
  const color = event.type.includes("conflict") ? "#ff345f" : "#e8fbff";
  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[0.24, 10, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} />
      <pointLight color={color} intensity={2.2} distance={3} />
    </mesh>
  );
}

export function DataTokenLayer({
  events,
}: {
  readonly events: readonly EventEnvelope[];
}) {
  const visible = events.filter(
    (event) =>
      event.type === "pipe.transfer" ||
      event.type === "cell.read" ||
      event.type === "cell.write" ||
      event.type === "crossbar.grant" ||
      event.type === "cube.dispatch" ||
      event.type === "cube.stage" ||
      event.type === "memory.request" ||
      event.type === "memory.response",
  );
  return (
    <group>
      {visible.map((event, index) => (
        <DataToken
          key={`${event.cycle}-${event.seq}-${event.entity_id}`}
          event={event}
          index={index}
        />
      ))}
    </group>
  );
}

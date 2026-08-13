import type { TopologyEntity } from "@linxsimcity/topology";

import { StraightPipe } from "../common/StraightPipe.js";
import { routeSegments } from "./placement.js";

interface RoutePipeProps {
  readonly entity: TopologyEntity;
  readonly color?: string;
  readonly radius?: number;
  readonly opacity?: number;
}

export function RoutePipe({
  entity,
  color = "#4edcff",
  radius = 0.13,
  opacity = 0.82,
}: RoutePipeProps) {
  if (!entity.route) {
    throw new Error(`pipe ${entity.id} is missing its physical route`);
  }
  return (
    <group userData={{ entityId: entity.id }}>
      {routeSegments(entity.route).map((segment, index) => (
        <StraightPipe
          key={`${entity.id}:${index}`}
          from={segment.from}
          to={segment.to}
          color={color}
          radius={radius}
          opacity={opacity}
        />
      ))}
    </group>
  );
}

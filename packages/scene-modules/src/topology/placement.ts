import type {
  TopologyEntity,
  TopologyPlacement,
  TopologyRoute,
  TopologyVector3,
} from "@linxsimcity/topology";

import type { BoxInstance } from "../common/box-instance.js";

export interface RouteSegment {
  readonly from: TopologyVector3;
  readonly to: TopologyVector3;
}

export function placementToBox(
  id: string,
  placement: TopologyPlacement,
): BoxInstance {
  if (!placement.position || !placement.size) {
    throw new Error(`physical entity ${id} is missing position or size`);
  }
  return {
    id,
    position: placement.position,
    scale: placement.size,
    ...(placement.rotation?.[1] !== undefined
      ? { rotationY: placement.rotation[1] }
      : {}),
  };
}

export function entityToBox(entity: TopologyEntity): BoxInstance {
  if (!entity.placement) {
    throw new Error(`physical entity ${entity.id} is missing placement`);
  }
  return placementToBox(entity.id, entity.placement);
}

export function routeSegments(route: TopologyRoute): readonly RouteSegment[] {
  return route.points.slice(1).map((to, index) => ({
    from: route.points[index]!,
    to,
  }));
}

export function routeLength(route: TopologyRoute): number {
  return routeSegments(route).reduce(
    (total, segment) =>
      total +
      Math.hypot(
        segment.to[0] - segment.from[0],
        segment.to[1] - segment.from[1],
        segment.to[2] - segment.from[2],
      ),
    0,
  );
}

export function physicalEntities(
  entities: readonly TopologyEntity[],
  predicate: (entity: TopologyEntity) => boolean,
): readonly TopologyEntity[] {
  return entities.filter((entity) => predicate(entity) && entity.placement);
}

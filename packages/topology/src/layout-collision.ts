import type {
  TopologyDescriptor,
  TopologyEntity,
  TopologyPlacement,
  TopologyRoute,
  TopologyVector3,
} from "./types.js";

export type LayoutCollisionKind =
  | "district-overlap"
  | "entity-overlap"
  | "pipe-building-crossing";

export interface LayoutCollision {
  readonly kind: LayoutCollisionKind;
  readonly firstId: string;
  readonly secondId: string;
  readonly message: string;
}

interface Bounds2 {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function bounds(
  id: string,
  position: TopologyVector3,
  size: TopologyVector3,
): Bounds2 {
  return {
    id,
    minX: position[0] - size[0] / 2,
    maxX: position[0] + size[0] / 2,
    minZ: position[2] - size[2] / 2,
    maxZ: position[2] + size[2] / 2,
  };
}

function placementBounds(
  id: string,
  placement: TopologyPlacement,
): Bounds2 | undefined {
  return placement.position && placement.size
    ? bounds(id, placement.position, placement.size)
    : undefined;
}

function positiveOverlap(first: Bounds2, second: Bounds2): boolean {
  return (
    Math.min(first.maxX, second.maxX) > Math.max(first.minX, second.minX) &&
    Math.min(first.maxZ, second.maxZ) > Math.max(first.minZ, second.minZ)
  );
}

function overlappingPairs(items: readonly Bounds2[]): [Bounds2, Bounds2][] {
  const sorted = [...items].sort(
    (first, second) =>
      first.minX - second.minX || first.id.localeCompare(second.id),
  );
  const result: [Bounds2, Bounds2][] = [];
  for (let index = 0; index < sorted.length; index++) {
    const first = sorted[index]!;
    for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex++) {
      const second = sorted[nextIndex]!;
      if (second.minX >= first.maxX) break;
      if (positiveOverlap(first, second)) result.push([first, second]);
    }
  }
  return result;
}

function isSolidModule(entity: TopologyEntity): boolean {
  return (
    entity.kind === "module" &&
    entity.placement?.position !== undefined &&
    entity.placement.size !== undefined &&
    entity.attributes?.collisionRole !== "container"
  );
}

function segmentCrossesBounds(
  from: TopologyVector3,
  to: TopologyVector3,
  target: Bounds2,
): boolean {
  const minX = Math.min(from[0], to[0]);
  const maxX = Math.max(from[0], to[0]);
  const minZ = Math.min(from[2], to[2]);
  const maxZ = Math.max(from[2], to[2]);

  if (from[2] === to[2]) {
    return (
      from[2] > target.minZ &&
      from[2] < target.maxZ &&
      Math.min(maxX, target.maxX) > Math.max(minX, target.minX)
    );
  }
  if (from[0] === to[0]) {
    return (
      from[0] > target.minX &&
      from[0] < target.maxX &&
      Math.min(maxZ, target.maxZ) > Math.max(minZ, target.minZ)
    );
  }
  return false;
}

function routeCrossesBounds(route: TopologyRoute, target: Bounds2): boolean {
  for (let index = 1; index < route.points.length; index++) {
    if (
      segmentCrossesBounds(
        route.points[index - 1]!,
        route.points[index]!,
        target,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function findLayoutCollisions(
  topology: TopologyDescriptor,
): readonly LayoutCollision[] {
  const collisions: LayoutCollision[] = [];
  const districts =
    topology.layout?.districts
      .filter((district) => district.id !== "core")
      .map((district) => bounds(district.id, district.position, district.size)) ??
    [];
  for (const [first, second] of overlappingPairs(districts)) {
    collisions.push({
      kind: "district-overlap",
      firstId: first.id,
      secondId: second.id,
      message: `districts "${first.id}" and "${second.id}" overlap`,
    });
  }

  const solids = topology.entities.filter(isSolidModule);
  const siblingGroups = new Map<string, Bounds2[]>();
  for (const entity of solids) {
    const entityBounds = placementBounds(entity.id, entity.placement!);
    if (!entityBounds) continue;
    const key = `${entity.placement!.district}\u0000${entity.parentId ?? ""}`;
    const group = siblingGroups.get(key) ?? [];
    group.push(entityBounds);
    siblingGroups.set(key, group);
  }
  for (const group of siblingGroups.values()) {
    for (const [first, second] of overlappingPairs(group)) {
      collisions.push({
        kind: "entity-overlap",
        firstId: first.id,
        secondId: second.id,
        message: `entities "${first.id}" and "${second.id}" overlap`,
      });
    }
  }

  const entityByPort = new Map<string, string>();
  for (const entity of topology.entities) {
    for (const port of entity.ports ?? []) entityByPort.set(port.id, entity.id);
  }
  const solidBounds = new Map(
    solids.flatMap((entity) => {
      const entityBounds = placementBounds(entity.id, entity.placement!);
      return entityBounds ? [[entity.id, entityBounds] as const] : [];
    }),
  );
  for (const pipe of topology.entities) {
    if (
      pipe.kind !== "pipe" ||
      !pipe.route ||
      pipe.attributes?.collisionRole === "hidden"
    )
      continue;
    const endpointIds = new Set([
      entityByPort.get(pipe.route.fromPortId),
      entityByPort.get(pipe.route.toPortId),
    ]);
    for (const [entityId, entityBounds] of solidBounds) {
      if (endpointIds.has(entityId)) continue;
      if (!routeCrossesBounds(pipe.route, entityBounds)) continue;
      collisions.push({
        kind: "pipe-building-crossing",
        firstId: pipe.id,
        secondId: entityId,
        message: `pipe "${pipe.id}" crosses entity "${entityId}"`,
      });
    }
  }

  return collisions;
}

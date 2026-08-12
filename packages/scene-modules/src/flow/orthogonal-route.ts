export type Point3 = readonly [number, number, number];

export interface RouteSegment {
  readonly from: Point3;
  readonly to: Point3;
}

export function orthogonalRoute(
  from: Point3,
  to: Point3,
  order: "x-first" | "z-first" = "x-first",
): readonly RouteSegment[] {
  const segments: RouteSegment[] = [];
  let current = from;
  const axes = order === "x-first" ? [0, 1, 2] : [2, 1, 0];
  for (const axis of axes) {
    if (current[axis] === to[axis]) continue;
    const next: [number, number, number] = [...current];
    next[axis] = to[axis]!;
    segments.push({ from: current, to: next });
    current = next;
  }
  return segments;
}

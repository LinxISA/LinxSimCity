import { expect, test } from "vitest";

import { orthogonalRoute } from "./orthogonal-route.js";

test("data routes contain only straight axis-aligned segments", () => {
  const route = orthogonalRoute([-10, 1, -20], [30, 1, 12], "x-first");
  expect(route).toHaveLength(2);
  for (const segment of route) {
    const changedAxes = segment.from.filter(
      (value, axis) => value !== segment.to[axis],
    );
    expect(changedAxes).toHaveLength(1);
  }
  expect(route[0]!.to[0]).toBeGreaterThan(route[0]!.from[0]);

  const bRoute = orthogonalRoute([20, 1, 23], [20, 1, -29], "z-first");
  expect(bRoute).toHaveLength(1);
  expect(bRoute[0]!.to[2]).toBeLessThan(bRoute[0]!.from[2]);
});

import { expect, test } from "vitest";

import {
  cacheEntityIds,
  robAngle,
  scalarPipeline,
  SPEROB_SLOT_COUNT,
} from "./scalar-layout.js";

test("scalar district preserves O3 pipeline order and physical counts", () => {
  expect(scalarPipeline.map(({ id }) => id)).toEqual([
    "fetch",
    "decode",
    "rename",
    "iq",
    "execute",
    "rob",
    "commit",
  ]);
  expect(cacheEntityIds("l1i")).toHaveLength(1_024);
  expect(cacheEntityIds("l1d")).toHaveLength(1_024);
  expect(SPEROB_SLOT_COUNT).toBe(128);
  expect(robAngle(0)).toBeCloseTo(-Math.PI / 2);
  expect(robAngle(64)).toBeCloseTo(Math.PI / 2);
});

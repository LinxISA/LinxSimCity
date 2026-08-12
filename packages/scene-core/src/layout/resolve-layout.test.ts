import type { TopologyDescriptor } from "@linxsimcity/topology";
import { expect, test } from "vitest";

import { DISTRICT_BOUNDS, resolveLayout } from "./resolve-layout.js";

const topology: TopologyDescriptor = { schemaVersion: "1.0.0", entities: [] };

test("city districts form a stable horizontal rectangle", () => {
  const first = resolveLayout(topology);
  const second = resolveLayout(topology);
  expect(second).toEqual(first);
  expect(first.core.width / first.core.depth).toBeGreaterThan(1.7);
  expect(first.districts.map((district) => district.id)).toEqual([
    "scalar",
    "vector",
    "cell",
    "cube",
    "stgbufb",
    "tlsu",
  ]);
  expect(DISTRICT_BOUNDS.stgbufb.z).toBeGreaterThan(DISTRICT_BOUNDS.cube.z);
  expect(DISTRICT_BOUNDS.tlsu.z).toBeGreaterThan(
    DISTRICT_BOUNDS.stgbufb.z + DISTRICT_BOUNDS.stgbufb.depth,
  );
});

test("four CELL and CUBE PE rows align one-to-one", () => {
  const layout = resolveLayout(topology);
  expect(layout.peRows).toHaveLength(4);
  for (const row of layout.peRows) {
    expect(row.cell.z).toBe(row.cube.z);
    expect(row.cell.depth).toBe(row.cube.depth);
    expect(row.cell.width).toBeLessThan(row.cube.width);
  }
});

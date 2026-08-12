import { resolveLayout } from "@linxsimcity/scene-core";
import { expect, test } from "vitest";

import { cubeEntityId, cubeInstanceId, cubeMapping } from "./cube-mapping.js";

test("CUBE exposes four aligned 16M × 4N strips with K16 metadata", () => {
  expect(cubeInstanceId(0, 0, 0)).toBe(0);
  expect(cubeInstanceId(3, 15, 3)).toBe(255);
  expect(cubeMapping(2, 7, 3)).toEqual({
    pe: 2,
    m: 7,
    n: 3,
    kDepth: 16,
    instanceId: 159,
    entityId: "pe2.cube.mac.m7.n3",
  });
  expect(cubeEntityId(2, 7, 3)).toBe("pe2.cube.mac.m7.n3");

  const layout = resolveLayout({ schemaVersion: "1.0.0", entities: [] });
  expect(layout.peRows.every((row) => row.cell.z === row.cube.z)).toBe(true);
  expect(
    layout.districts.find(({ id }) => id === "stgbufb")!.z,
  ).toBeGreaterThan(layout.peRows.at(-1)!.cube.z);
});

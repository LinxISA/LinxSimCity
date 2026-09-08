import { CORE_CATALOG } from "@linxsimcity/component-catalog";
import { validateBlueprint } from "@linxsimcity/world";
import { expect, test } from "vitest";

import { createStarterBlueprint } from "./starter.js";

test("the first game blueprint is a valid request, Tile, compute, writeback path", () => {
  const blueprint = createStarterBlueprint();
  expect(validateBlueprint(blueprint, CORE_CATALOG)).toEqual([]);
  expect(blueprint.instances.map((item) => item.id)).toEqual([
    "queue.request",
    "sram.tile",
    "vector.0",
    "sram.writeback",
  ]);
  expect(blueprint.links).toHaveLength(3);
});

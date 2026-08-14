import { expect, test } from "vitest";

import { CAMERA_PRESETS, visibleWidthAtTarget } from "./presets.js";

test("the Core preset centers and frames the complete 240-unit city width", () => {
  expect(CAMERA_PRESETS.city.target).toEqual([0, 0, 0]);
  expect(visibleWidthAtTarget(CAMERA_PRESETS.city, 38, 16 / 9)).toBeGreaterThan(
    240,
  );
});

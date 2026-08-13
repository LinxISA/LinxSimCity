import { expect, test } from "vitest";

import { focusOptions } from "./SceneViewport.js";

test("camera toolbar exposes every architectural district used by traces", () => {
  expect(focusOptions).toEqual([
    { id: "city", label: "Core" },
    { id: "scalar", label: "Scalar" },
    { id: "vector", label: "Vector" },
    { id: "cell", label: "CELL" },
    { id: "cube", label: "CUBE" },
    { id: "tlsu", label: "TLSU" },
  ]);
});

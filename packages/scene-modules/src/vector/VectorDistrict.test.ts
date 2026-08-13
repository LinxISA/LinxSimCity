import { expect, test } from "vitest";

import { vectorModuleForStage } from "./vector-stage.js";

test.each([
  ["fma", "fmla"],
  ["alu", "alu"],
  ["reduce", "reduce"],
  ["writeback", "vrf"],
  ["dispatch", undefined],
  [undefined, undefined],
] as const)("maps vector stage %s to its physical module", (stage, module) => {
  expect(vectorModuleForStage(stage)).toBe(module);
});

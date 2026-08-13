import { describe, expect, test } from "vitest";

import { placementToBox, routeLength, routeSegments } from "./placement.js";

describe("physical topology placement", () => {
  test("copies the model-provided box transform without reinterpretation", () => {
    expect(
      placementToBox("pe2.prf.reg7", {
        district: "scalar",
        thread: 2,
        position: [-81, 0.65, 2.2],
        size: [0.62, 0.3, 0.52],
        rotation: [0, 0.75, 0],
      }),
    ).toEqual({
      id: "pe2.prf.reg7",
      position: [-81, 0.65, 2.2],
      scale: [0.62, 0.3, 0.52],
      rotationY: 0.75,
    });
  });

  test("turns every consecutive orthogonal point pair into one straight pipe", () => {
    const route = {
      style: "orthogonal" as const,
      fromPortId: "a",
      toPortId: "b",
      points: [
        [0, 1, 0],
        [8, 1, 0],
        [8, 1, 6],
      ] as [number, number, number][],
    };
    expect(routeSegments(route)).toEqual([
      { from: [0, 1, 0], to: [8, 1, 0] },
      { from: [8, 1, 0], to: [8, 1, 6] },
    ]);
    expect(routeLength(route)).toBe(14);
  });
});

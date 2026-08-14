import { expect, test } from "vitest";

import type { TopologyDescriptor } from "@linxsimcity/topology";

import { districtRect, hasPipeviewStageCity } from "./district.js";

const topology: TopologyDescriptor = {
  schemaVersion: "1.1.0",
  layout: {
    schema: "linx-city-v1",
    units: "scene-unit",
    upAxis: "y",
    forwardAxis: "-z",
    districts: [
      { id: "core", position: [4, 0, -3], size: [240, 10, 128] },
      { id: "cube", position: [72, 0, -12], size: [88, 8, 92] },
    ],
  },
  entities: [
    {
      id: "pipeview.cube.stage.calc",
      kind: "module",
      label: "Calc",
      instance: {},
      attributes: {
        visualRole: "pipeview-stage",
        stageDomain: "cube",
        stageId: "Calc",
      },
    },
  ],
};

test("copies authoritative district center and size without reinterpretation", () => {
  expect(districtRect(topology, "cube")).toEqual({
    center: [72, 0, -12],
    size: [88, 8, 92],
  });
  expect(districtRect(topology, "missing")).toBeUndefined();
});

test("detects the stage-city renderer from topology content", () => {
  expect(hasPipeviewStageCity(topology)).toBe(true);
  expect(hasPipeviewStageCity({ ...topology, entities: [] })).toBe(false);
});

import { expect, test } from "vitest";

import { focusOptions, topologyStats } from "./SceneViewport.js";

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

test("scene statistics come from the physical trace topology", () => {
  expect(
    topologyStats({
      schemaVersion: "1.1.0",
      entities: [
        { id: "pe0.bg.bank0.row0", kind: "cell", label: "CELL 0" },
        { id: "pe0.bg.bank0.row1", kind: "cell", label: "CELL 1" },
        {
          id: "shared_tile_register.ssb0.cell0",
          kind: "cell",
          parentId: "shared_tile_register",
          label: "Shared CELL 0",
        },
        { id: "cube.pe0.mac.m0.n0", kind: "cube-mac", label: "MAC" },
        {
          id: "stgbufb.subspace0",
          kind: "stgbufb-subspace",
          label: "SsbID 0",
        },
      ],
    }),
  ).toEqual({ cells: 3, macs: 1, sharedTileCells: 1, ssbIds: 1 });
});

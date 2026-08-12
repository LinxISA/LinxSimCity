import { describe, expect, test } from "vitest";

import { formatEntityId } from "./index.js";

describe("formatEntityId", () => {
  test.each([
    [{ kind: "module", path: ["Scalar", "Fetch"] }, "scalar.fetch"],
    [
      { kind: "cache-line", pe: 1, cache: "L1D", set: 12, way: 3 },
      "pe1.l1d.set12.way3",
    ],
    [{ kind: "rob-slot", pe: 0, slot: 127 }, "pe0.sperob.slot127"],
    [{ kind: "queue-slot", pe: 3, queue: "LDQ", slot: 7 }, "pe3.ldq.slot7"],
    [{ kind: "register", pe: 2, file: "PRF", index: 31 }, "pe2.prf.reg31"],
    [{ kind: "cell", pe: 2, bank: 5, row: 23 }, "pe2.bg.bank5.row23"],
    [
      { kind: "xbar-lane", pe: 2, xbar: "BG_XBAR", lane: 15 },
      "pe2.bg_xbar.lane15",
    ],
    [{ kind: "cube-mac", pe: 3, m: 15, n: 2 }, "pe3.cube.mac.m15.n2"],
    [{ kind: "stgbufb-subspace", subspace: 63 }, "stgbufb.subspace63"],
    [
      { kind: "pipe", path: ["Scalar", "Decode_Rename"], lane: 1 },
      "scalar.pipe.decode_rename.lane1",
    ],
  ] as const)("formats structural parts as %s", (parts, expected) => {
    expect(formatEntityId(parts)).toBe(expected);
  });

  test("does not accept display labels as ID input", () => {
    expect(() =>
      formatEntityId({ kind: "module", path: ["Fetch Stage #1"] }),
    ).toThrow(/structural/i);
  });

  test("rejects an empty structural module path", () => {
    expect(() => formatEntityId({ kind: "module", path: [] })).toThrow(
      /structural/i,
    );
  });

  test.each([
    { kind: "cell", pe: -1, bank: 0, row: 0 },
    { kind: "cache-line", cache: "l1d", set: 1.5, way: 0 },
  ] as const)("rejects invalid structural indexes", (parts) => {
    expect(() => formatEntityId(parts)).toThrow(/index/i);
  });
});

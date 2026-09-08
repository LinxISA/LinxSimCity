import { CORE_CATALOG, CORE_BRICK_BY_ID } from "@linxsimcity/component-catalog";
import { describe, expect, test } from "vitest";

import {
  addPosition,
  blueprintFingerprint,
  createInstance,
  emptyBlueprint,
  positionToTuple,
  validateBlueprint,
  worldPosition,
} from "./index.js";

describe("world coordinates", () => {
  test("normalize positive and negative positions across chunks", () => {
    expect(positionToTuple(worldPosition(-65, 130, 63))).toEqual([
      -65, 130, 63,
    ]);
    expect(
      positionToTuple(addPosition(worldPosition(63, 0, 0), [2, -1, 0])),
    ).toEqual([65, -1, 0]);
  });
});

describe("blueprints", () => {
  test("validate a typed connection and keep display position out of its fingerprint", () => {
    const queue = createInstance(
      "queue.1",
      CORE_BRICK_BY_ID.get("core.queue")!,
      [0, 0, 0],
    );
    const alu = createInstance(
      "alu.1",
      CORE_BRICK_BY_ID.get("core.alu")!,
      [8, 0, 0],
    );
    const blueprint = {
      ...emptyBlueprint(),
      instances: [queue, alu],
      links: [
        {
          id: "link.1",
          from: { instanceId: queue.id, portId: "out" },
          to: { instanceId: alu.id, portId: "issue" },
        },
      ],
    } as const;
    expect(validateBlueprint(blueprint, CORE_CATALOG)).toEqual([]);
    const moved = {
      ...blueprint,
      instances: [
        queue,
        {
          ...alu,
          transform: {
            ...alu.transform,
            position: worldPosition(800, 4, -200),
          },
        },
      ],
    };
    expect(blueprintFingerprint(moved)).toBe(blueprintFingerprint(blueprint));
  });

  test("rejects a tile link into a transaction input", () => {
    const sram = createInstance(
      "sram.1",
      CORE_BRICK_BY_ID.get("core.sram")!,
      [0, 0, 0],
    );
    const alu = createInstance(
      "alu.1",
      CORE_BRICK_BY_ID.get("core.alu")!,
      [8, 0, 0],
    );
    const blueprint = {
      ...emptyBlueprint(),
      instances: [sram, alu],
      links: [
        {
          id: "link.bad",
          from: { instanceId: sram.id, portId: "tile-out" },
          to: { instanceId: alu.id, portId: "issue" },
        },
      ],
    } as const;
    expect(validateBlueprint(blueprint, CORE_CATALOG)).toContainEqual(
      expect.objectContaining({ code: "protocol_mismatch" }),
    );
  });
});

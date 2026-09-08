import { CORE_BRICK_BY_ID } from "@linxsimcity/component-catalog";
import { createInstance, emptyBlueprint } from "@linxsimcity/world";
import { expect, test } from "vitest";

import { proposeLink } from "./links.js";

test("proposes the first compatible unoccupied typed port", () => {
  const queue = createInstance(
    "queue.1",
    CORE_BRICK_BY_ID.get("core.queue")!,
    [0, 0, 0],
  );
  const vector = createInstance(
    "vector.1",
    CORE_BRICK_BY_ID.get("core.vector")!,
    [8, 0, 0],
  );
  const result = proposeLink(
    { ...emptyBlueprint(), instances: [queue, vector] },
    CORE_BRICK_BY_ID,
    queue.id,
    vector.id,
    "link.1",
  );
  expect(result).toEqual({
    ok: true,
    link: {
      id: "link.1",
      from: { instanceId: "queue.1", portId: "out" },
      to: { instanceId: "vector.1", portId: "issue" },
    },
  });
});

test("does not connect a tile output to a transaction-only unit", () => {
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
  expect(
    proposeLink(
      { ...emptyBlueprint(), instances: [sram, alu] },
      CORE_BRICK_BY_ID,
      sram.id,
      alu.id,
      "link.bad",
    ),
  ).toEqual(expect.objectContaining({ ok: false }));
});

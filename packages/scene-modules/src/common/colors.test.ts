import type { EntityState } from "@linxsimcity/trace-runtime";
import type { EventEnvelope } from "@linxsimcity/trace-schema";
import { describe, expect, test } from "vitest";

import { colorForState, STATUS_COLORS } from "./colors.js";

const BASE = 0x102030;

function state(type: EventEnvelope["type"], cycle: number): EntityState {
  return {
    id: "pe0.prf.reg1",
    label: "p1",
    kind: "register",
    status: "idle",
    steadyStatus: "idle",
    available: true,
    lastEvent: {
      cycle,
      seq: 0,
      type,
      scope: "test",
      entity_id: "pe0.prf.reg1",
      payload: {},
    },
    data: {},
  };
}

describe("cycle-aged structure feedback", () => {
  test("fades a PRF read from its peak color back to the module base", () => {
    const read = state("register.read", 20);

    expect(colorForState(read, BASE, false, 20)).toBe(STATUS_COLORS.read);
    expect(colorForState(read, BASE, false, 23)).not.toBe(STATUS_COLORS.read);
    expect(colorForState(read, BASE, false, 23)).not.toBe(BASE);
    expect(colorForState(read, BASE, false, 26)).toBe(BASE);
  });

  test.each([
    ["register.write", "write"],
    ["cache.hit", "hit"],
    ["cache.miss", "miss"],
    ["cell.grant", "grant"],
    ["cell.conflict", "conflict"],
    ["rob.flush", "flush"],
  ] as const)("maps %s to the distinct %s peak", (type, status) => {
    expect(colorForState(state(type, 40), BASE, false, 40)).toBe(
      STATUS_COLORS[status],
    );
  });
});

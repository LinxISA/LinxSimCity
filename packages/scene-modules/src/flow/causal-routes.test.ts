import type { EventEnvelope } from "@linxsimcity/trace-schema";
import { describe, expect, test } from "vitest";

import {
  eventThreadId,
  threadColor,
  tokenColor,
  tokenOverlay,
} from "./thread-colors.js";

function event(type: EventEnvelope["type"]): EventEnvelope {
  return {
    cycle: 1,
    seq: 0,
    type,
    scope: "scalar",
    entity_id: "pe2.scalar.execute",
    payload: { instruction_id: 9, thread_id: 2 },
  };
}

describe("causal route ownership", () => {
  test("keeps one owner color across stages and overlays", () => {
    for (const type of [
      "pipeline.enter",
      "pipeline.stall",
      "cache.miss",
      "instruction.squash",
    ] as const) {
      expect(eventThreadId(event(type))).toBe(2);
      expect(tokenColor(event(type))).toBe(threadColor(2));
    }
    expect(tokenOverlay(event("pipeline.stall"))).toBe("stall");
    expect(tokenOverlay(event("cache.miss"))).toBe("miss");
    expect(tokenOverlay(event("instruction.squash"))).toBe("flush");
  });
});

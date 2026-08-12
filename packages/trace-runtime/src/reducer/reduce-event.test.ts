import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { expect, test } from "vitest";

import { initialSnapshot } from "./state.js";
import { reduceEvent } from "./reduce-event.js";

const topology: TopologyDescriptor = {
  schemaVersion: "1.0.0",
  entities: [
    {
      id: "pe0.bg.bank3.row9",
      kind: "cell",
      label: "CELL B3[9]",
      instance: { index: 9 },
    },
    {
      id: "core.scalar.rob.slot0",
      kind: "rob-slot",
      label: "ROB 0",
      instance: { index: 0 },
    },
  ],
};

function event(
  type: EventEnvelope["type"],
  entity_id: string,
  cycle = 3,
  payload: Record<string, unknown> = {},
): EventEnvelope {
  return { cycle, seq: 0, type, scope: "core0", entity_id, payload };
}

test("CELL conflict is an immutable sparse update", () => {
  const initial = initialSnapshot(topology);
  const next = reduceEvent(
    initial,
    event("cell.conflict", "pe0.bg.bank3.row9"),
  );
  expect(next.entities.get("pe0.bg.bank3.row9")?.status).toBe("conflict");
  expect(initial.entities.get("pe0.bg.bank3.row9")?.status).toBe("idle");
  expect(next.changedEntityIds).toEqual(["pe0.bg.bank3.row9"]);
});

test("cycle boundaries clear transient state without scanning topology", () => {
  const conflicted = reduceEvent(
    initialSnapshot(topology),
    event("cell.conflict", "pe0.bg.bank3.row9", 3),
  );
  const next = reduceEvent(
    conflicted,
    event("rob.allocate", "core.scalar.rob.slot0", 4, { slot: 0 }),
  );
  expect(next.entities.get("pe0.bg.bank3.row9")?.status).toBe("idle");
  expect(next.entities.get("core.scalar.rob.slot0")?.status).toBe("allocated");
  expect(next.changedEntityIds).toEqual([
    "core.scalar.rob.slot0",
    "pe0.bg.bank3.row9",
  ]);
});

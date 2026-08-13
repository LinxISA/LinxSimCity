import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { performance } from "node:perf_hooks";
import { expect, test } from "vitest";

import { initialSnapshot } from "./state.js";
import { reduceEvent, reduceEvents } from "./reduce-event.js";

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

test("batch reduction matches sequential replay without mutating its input", () => {
  const initial = initialSnapshot(topology);
  const events = [
    event("cell.write", "pe0.bg.bank3.row9", 3, { bytes: 128 }),
    { ...event("cell.read", "pe0.bg.bank3.row9", 3), seq: 1 },
    event("rob.allocate", "core.scalar.rob.slot0", 4, { slot: 0 }),
  ];
  const sequential = events.reduce(reduceEvent, initial);
  const batched = reduceEvents(initial, events);

  expect(batched).toEqual(sequential);
  expect(initial.entities.get("pe0.bg.bank3.row9")?.status).toBe("idle");
  expect(initial.entities.get("core.scalar.rob.slot0")?.status).toBe("idle");
});

test("batch replay scales to the physical 8192-cell topology", () => {
  const physicalTopology: TopologyDescriptor = {
    schemaVersion: "1.0.0",
    entities: Array.from({ length: 8192 }, (_, index) => ({
      id: `pe${Math.floor(index / 2048)}.bg.bank${Math.floor(index / 256) % 8}.row${index % 256}`,
      kind: "cell" as const,
      label: `CELL ${index}`,
      instance: { index: index % 256 },
    })),
  };
  const events = Array.from({ length: 4096 }, (_, index) =>
    event("cell.read", "pe0.bg.bank0.row0", index + 1, { bytes: 128 }),
  );

  const start = performance.now();
  const result = reduceEvents(initialSnapshot(physicalTopology), events);
  const elapsed = performance.now() - start;

  expect(result.cycle).toBe(4096);
  expect(result.entities.size).toBe(8192);
  expect(elapsed).toBeLessThan(1500);
});

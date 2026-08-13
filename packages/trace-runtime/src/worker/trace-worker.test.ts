import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { expect, test } from "vitest";

import { reduceEvents } from "../reducer/reduce-event.js";
import { initialSnapshot } from "../reducer/state.js";
import { serializeViewerSnapshot } from "./trace-worker.js";

const topology: TopologyDescriptor = {
  schemaVersion: "1.1.0",
  entities: [
    {
      id: "pe0.prf.reg1",
      kind: "register",
      label: "p1",
      instance: { index: 1 },
    },
    {
      id: "marker",
      kind: "module",
      label: "marker",
      instance: { index: 0 },
    },
  ],
};

function event(
  cycle: number,
  type: EventEnvelope["type"],
  entity_id: string,
): EventEnvelope {
  return {
    cycle,
    seq: 0,
    type,
    scope: "test",
    entity_id,
    payload:
      type === "register.read"
        ? { instruction_id: 1, thread_id: 0, phys_reg: 1 }
        : {},
  };
}

test("serializes recently active transient entities for bounded color decay", () => {
  const recent = reduceEvents(initialSnapshot(topology), [
    event(1, "register.read", "pe0.prf.reg1"),
    event(5, "marker.user", "marker"),
  ]);
  const expired = reduceEvents(initialSnapshot(topology), [
    event(1, "register.read", "pe0.prf.reg1"),
    event(7, "marker.user", "marker"),
  ]);

  expect(
    serializeViewerSnapshot(recent).entities.map(([entityId]) => entityId),
  ).toContain("pe0.prf.reg1");
  expect(
    serializeViewerSnapshot(expired).entities.map(([entityId]) => entityId),
  ).not.toContain("pe0.prf.reg1");
});

import { CORE_CATALOG } from "@linxsimcity/component-catalog";
import { validateArchitectureTopology } from "@linxsimcity/topology";
import { expect, test } from "vitest";

import { convertAgenticQueuePlan, parseAgenticQueuePlan } from "./index.js";

const plan = parseAgenticQueuePlan({
  schema: "agentic-circuit-queue-graph-plan",
  version: "0.5",
  contract_epoch: "0.5",
  system: "test_system",
  scopes: ["/execute"],
  queues: [
    {
      name: "requests",
      scope: "/",
      depth: 4,
      latency: 1,
      rate: 1,
      payload_type: "!ac.struct<@types::@Request>",
    },
    {
      name: "results",
      scope: "/execute",
      depth: 2,
      latency: 1,
      rate: 1,
      payload_type: "!ac.struct<@types::@Request>",
    },
  ],
  blocks: [
    {
      name: "requests",
      kind: "source",
      scope: "/",
      lexical_order: 0,
      inputs: [],
      outputs: ["requests"],
      capacity: 0,
      resources: 0,
      latencies: [1],
    },
    {
      name: "results",
      kind: "transform",
      scope: "/execute",
      lexical_order: 1,
      inputs: ["requests"],
      outputs: ["results"],
      capacity: 0,
      resources: 0,
      latencies: [1],
    },
    {
      name: "sink",
      kind: "sink",
      scope: "/",
      lexical_order: 2,
      inputs: ["results"],
      outputs: [],
      capacity: 0,
      resources: 0,
      latencies: [],
    },
  ],
});

test("converts QueueGraph queues and producer/consumer relationships", () => {
  const topology = convertAgenticQueuePlan(plan, {
    repository: "https://example.test/pycircuit",
    revision: "0123456789012345678901234567890123456789",
    worktreeDirty: false,
    relevantInputsDirty: false,
    planSha256: "a".repeat(64),
    modelSha256: "b".repeat(64),
  });
  expect(validateArchitectureTopology(topology, CORE_CATALOG)).toEqual([]);
  expect(topology.nodes).toHaveLength(7);
  expect(topology.edges).toHaveLength(4);
  expect(topology.nodes).toContainEqual(
    expect.objectContaining({
      id: "queue.q000.requests",
      parameters: { capacity: 4, latency: 1 },
      attributes: expect.objectContaining({
        payloadType: "!ac.struct<@types::@Request>",
      }),
    }),
  );
});

test("rejects unsupported QueueGraph block kinds", () => {
  expect(() =>
    convertAgenticQueuePlan(
      { ...plan, blocks: [{ ...plan.blocks[0]!, kind: "unknown" }] },
      {
        repository: "https://example.test/pycircuit",
        revision: "revision",
        worktreeDirty: false,
        relevantInputsDirty: false,
        planSha256: "a".repeat(64),
        modelSha256: "b".repeat(64),
      },
    ),
  ).toThrow(/unsupported QueueGraph block kind/);
});

test("assigns engine-specific visual definitions from canonical scopes", () => {
  const enginePlan = {
    ...plan,
    scopes: ["/vector_engine"],
    queues: plan.queues.map((queue, index) =>
      index === 1 ? { ...queue, scope: "/vector_engine" } : queue,
    ),
    blocks: plan.blocks.map((block, index) =>
      index === 1 ? { ...block, scope: "/vector_engine" } : block,
    ),
  };
  const topology = convertAgenticQueuePlan(enginePlan, {
    repository: "https://example.test/pycircuit",
    revision: "0123456789012345678901234567890123456789",
    worktreeDirty: false,
    relevantInputsDirty: false,
    planSha256: "a".repeat(64),
    modelSha256: "b".repeat(64),
  });
  expect(topology.nodes).toContainEqual(
    expect.objectContaining({
      id: "block.b001.results",
      definitionId: "ac.vector-engine",
    }),
  );
});

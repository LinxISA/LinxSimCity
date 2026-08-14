import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type { TopologyEntity } from "@linxsimcity/topology";
import { describe, expect, test } from "vitest";

import {
  activeStageBays,
  eventMatchesStage,
  pipeviewPipes,
  pipeviewStages,
} from "./stage-entities.js";

function event(
  entityId: string,
  stageId: string,
  threadId: number,
  type: EventEnvelope["type"] = "pipeline.enter",
): EventEnvelope {
  return {
    type,
    scope: "PE",
    cycle: 8,
    seq: threadId,
    entity_id: entityId,
    payload: { stage_id: stageId, thread_id: threadId },
  };
}

function stage(domain: string, stageId: string): TopologyEntity {
  return {
    id: `pipeview.${domain}.stage.${stageId.toLowerCase()}`,
    kind: "module",
    label: stageId,
    instance: {},
    attributes: {
      visualRole: "pipeview-stage",
      stageDomain: domain,
      stageId,
      peBays: 4,
    },
  };
}

describe("PipeView stage entities", () => {
  test("selects only stage buildings and stage pipes", () => {
    const stageEntity = stage("scalar", "F1");
    const pipe: TopologyEntity = {
      id: "pipeview.scalar.pipe.f0-f1",
      kind: "pipe",
      label: "F0 -> F1",
      instance: {},
      attributes: { visualRole: "pipeview-pipe" },
    };
    const legacy = { ...stageEntity, id: "legacy", attributes: {} };
    const topology = {
      schemaVersion: "1.1.0",
      entities: [legacy, pipe, stageEntity],
    };
    expect(pipeviewStages(topology)).toEqual([stageEntity]);
    expect(pipeviewPipes(topology)).toEqual([pipe]);
  });

  test("normalizes model stage spelling without matching another domain", () => {
    expect(
      eventMatchesStage(event("pe1.cube", "srcAready", 1, "cube.stage"), {
        domain: "cube",
        stageId: "SrcAReady",
      }),
    ).toBe(true);
    expect(
      eventMatchesStage(event("pe1.cube", "ReName", 1, "cube.stage"), {
        domain: "cube",
        stageId: "Rename",
      }),
    ).toBe(true);
    expect(
      eventMatchesStage(event("pe1.vector", "E1", 1), {
        domain: "scalar",
        stageId: "E1",
      }),
    ).toBe(false);
  });

  test("activates simultaneous PE bays and ignores invalid thread IDs", () => {
    const target = stage("scalar", "P1");
    expect(
      activeStageBays(
        [
          event("pe0.scalar.pipe.alu", "P1", 0),
          event("pe3.scalar.pipe.bru", "P1", 3),
          event("pe9.scalar.pipe.alu", "P1", 9),
        ],
        target,
      ),
    ).toEqual([true, false, false, true]);
  });
});

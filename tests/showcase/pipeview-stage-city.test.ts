import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, test } from "vitest";

import {
  findLayoutCollisions,
  validateTopology,
  type TopologyDescriptor,
} from "../../packages/topology/src/index.js";
import {
  PIPEVIEW_STAGE_DOMAINS,
  enrichPipeviewStageCity,
} from "../../scripts/lib/pipeview-stage-city.mjs";

function minimalTopology(): TopologyDescriptor {
  return {
    schemaVersion: "1.1.0",
    layout: {
      schema: "linx-city-v1",
      units: "scene-unit",
      upAxis: "y",
      forwardAxis: "-z",
      districts: [
        { id: "core", position: [0, 0, 0], size: [220, 10, 120] },
      ],
    },
    entities: [
      {
        id: "core",
        kind: "module",
        label: "Linx Core",
        instance: {},
        placement: {
          district: "core",
          position: [0, 0, 0],
          size: [220, 8, 120],
        },
        attributes: { collisionRole: "container" },
      },
    ],
  };
}

describe("PipeView stage city topology", () => {
  test("uses the exact SuperScalarModel stage inventories", () => {
    expect(PIPEVIEW_STAGE_DOMAINS.scalar).toEqual([
      "F0",
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
      "D0",
      "D1",
      "D2",
      "D3",
      "S1",
      "IQ",
      "RD",
      "P1",
      "I1",
      "I2",
      "E0",
      "E1",
      "E2",
      "E3",
      "E4",
      "E5",
      "W1",
      "W2",
      "CM",
      "R",
    ]);
    expect(PIPEVIEW_STAGE_DOMAINS.scalarMemory).toEqual([
      "LSU-E1",
      "LDQ",
      "LQP",
      "LQI",
      "L1M",
      "L2M",
      "MR",
      "L2R",
      "L1R",
      "LR",
    ]);
    expect(PIPEVIEW_STAGE_DOMAINS.vector).toEqual([
      "F",
      "S",
      "P",
      "I",
      "E1",
      "E2",
      "E3",
      "E4",
      "E5",
      "W1",
      "W2",
      "CM",
    ]);
    expect(PIPEVIEW_STAGE_DOMAINS.cube).toEqual([
      "Issue",
      "Rename",
      "GenLoad",
      "Wait",
      "SrcAReady",
      "SrcBReady",
      "SrcCReady",
      "RdBuffer",
      "Ctrl",
      "Calc",
      "L0CWr",
      "Commit",
    ]);
    expect(PIPEVIEW_STAGE_DOMAINS.acccvt).toEqual([
      "Start",
      "Rename",
      "Issue",
      "Arb",
      "Wait",
      "SrcReady",
      "SrcData",
      "FixPipe",
    ]);
    expect(PIPEVIEW_STAGE_DOMAINS.tlsu).toEqual([
      "Start",
      "ToScalper",
      "ToTile",
      "GenPreReq",
      "MemoryReq",
      "PreDataRet",
      "FromScalper",
      "GenLoadReq",
      "TileReadReq",
      "TileDataRet",
      "LoadDataRet",
      "Commit",
    ]);
    expect(PIPEVIEW_STAGE_DOMAINS.tileBridge).toEqual([
      "Start",
      "WaitB",
      "GenR",
      "Tag",
      "WaitR",
      "GenW",
      "WaitW",
      "Integ",
      "Ready",
      "TXed",
      "Bus",
      "DBID",
      "Ret",
      "Comp",
    ]);
  });

  test("builds a rectangular collision-free city with every stage and pipe", () => {
    const enriched = enrichPipeviewStageCity(minimalTopology());
    const core = enriched.layout?.districts.find(({ id }) => id === "core");
    expect(core).toBeDefined();
    if (!core) throw new Error("enriched topology is missing the core district");
    expect(core.size[0] / core.size[2]).toBe(1.875);

    const stages = enriched.entities.filter(
      ({ attributes }) => attributes?.visualRole === "pipeview-stage",
    );
    const expectedStages = Object.values(PIPEVIEW_STAGE_DOMAINS).reduce(
      (total, domain) => total + domain.length,
      0,
    );
    expect(stages).toHaveLength(expectedStages);
    expect(
      new Set(
        stages.map(
          ({ attributes }) =>
            `${attributes?.stageDomain}:${attributes?.stageId}`,
        ),
      ).size,
    ).toBe(expectedStages);

    const stagePipes = enriched.entities.filter(
      ({ attributes }) => attributes?.visualRole === "pipeview-pipe",
    );
    expect(stagePipes).toHaveLength(expectedStages - 7);

    const sharedCells = enriched.entities.filter(
      ({ parentId, kind }) =>
        parentId === "shared_tile_register" && kind === "cell",
    );
    expect(sharedCells).toHaveLength(2048);
    expect(
      enriched.entities.find(({ id }) => id === "shared_tile_register"),
    ).toMatchObject({
      label: "Shared Tile Register",
      attributes: {
        compatibilityAlias: "stgbufb",
        cell_bytes: 128,
        total_bytes: 262_144,
      },
    });

    expect(
      enriched.entities.filter(
        ({ attributes }) => attributes?.operand === "A",
      ),
    ).toHaveLength(16);
    expect(
      enriched.entities.filter(
        ({ attributes }) => attributes?.operand === "B",
      ),
    ).toHaveLength(4);
    expect(validateTopology(enriched).errors).toEqual([]);
    expect(findLayoutCollisions(enriched)).toEqual([]);
  });

  test("does not mutate its source topology", () => {
    const source = minimalTopology();
    const before = JSON.stringify(source);
    enrichPipeviewStageCity(source);
    expect(JSON.stringify(source)).toBe(before);
  });

  test("atomically enriches a trace directory and refuses accidental replay", () => {
    const root = mkdtempSync(join(tmpdir(), "linxsimcity-stage-city-"));
    writeFileSync(
      join(root, "topology.json"),
      `${JSON.stringify(minimalTopology())}\n`,
    );
    writeFileSync(
      join(root, "manifest.json"),
      `${JSON.stringify({
        schemaVersion: "1.1.0",
        modelVersion: "test",
        profile: "pipeline",
        firstCycle: 10,
        lastCycle: 20,
        eventCount: 3,
        chunkCount: 1,
        chunkCycleSpan: 4096,
        checkpointCycleSpan: 4096,
        capabilities: ["physical-layout-v1"],
      })}\n`,
    );
    const script = fileURLToPath(
      new URL("../../scripts/enrich-pipeview-stage-city.mjs", import.meta.url),
    );
    const first = spawnSync(process.execPath, [script, "--trace-dir", root], {
      encoding: "utf8",
    });
    expect(first.status, first.stderr).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(root, "manifest.json"), "utf8"),
    ) as { eventCount: number; capabilities: string[] };
    expect(manifest).toMatchObject({ eventCount: 3 });
    expect(manifest.capabilities).toEqual([
      "physical-layout-v1",
      "pipeview-stage-city-v1",
    ]);
    expect(readdirSync(root).sort()).toEqual([
      "manifest.json",
      "topology.json",
    ]);

    const second = spawnSync(process.execPath, [script, "--trace-dir", root], {
      encoding: "utf8",
    });
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("already declares pipeview-stage-city-v1");
  });
});

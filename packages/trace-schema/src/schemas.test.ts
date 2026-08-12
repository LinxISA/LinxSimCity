import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { describe, expect, test } from "vitest";

import {
  TRACE_EVENT_TYPES,
  assertCompatibleVersion,
  parseEvent,
  parseIndex,
  parseManifest,
} from "./index.js";

describe("trace event schema", () => {
  test("accepts every event category declared by the v1 contract", () => {
    const expectedTypes = [
      "instruction.fetch",
      "instruction.decode",
      "instruction.rename",
      "instruction.dispatch",
      "instruction.issue",
      "instruction.complete",
      "instruction.retire",
      "instruction.squash",
      "pipeline.enter",
      "pipeline.leave",
      "pipeline.stall",
      "queue.allocate",
      "queue.release",
      "queue.occupancy",
      "queue.full",
      "rob.allocate",
      "rob.head",
      "rob.tail",
      "rob.retire",
      "rob.flush",
      "register.read",
      "register.write",
      "register.ready",
      "cache.access",
      "cache.hit",
      "cache.miss",
      "cache.fill",
      "cache.writeback",
      "cell.read",
      "cell.write",
      "cell.grant",
      "cell.conflict",
      "crossbar.request",
      "crossbar.grant",
      "cube.dispatch",
      "cube.stage",
      "cube.complete",
      "cube.writeback",
      "vector.dispatch",
      "vector.stage",
      "vector.complete",
      "vector.writeback",
      "memory.request",
      "memory.response",
      "pipe.transfer",
      "flush.begin",
      "flush.end",
      "marker.user",
    ] as const;

    expect(TRACE_EVENT_TYPES).toEqual(expectedTypes);

    for (const type of expectedTypes) {
      const payload =
        type === "cell.read"
          ? { request_id: 9, source: "cube", bytes: 128, result: "grant" }
          : {};

      expect(
        parseEvent({
          cycle: 7,
          seq: 2,
          type,
          scope: "pe0",
          entity_id: "x",
          payload,
        }).type,
      ).toBe(type);
    }
  });

  test("parses the discriminated payload for a CELL read", () => {
    const event = parseEvent({
      cycle: 7,
      seq: 2,
      type: "cell.read",
      scope: "pe0",
      entity_id: "pe0.bg.bank0.row3",
      payload: { request_id: 9, source: "cube", bytes: 128, result: "grant" },
    });

    expect(event.type).toBe("cell.read");
    expect(event.payload).toMatchObject({ result: "grant" });
  });

  test("retains future optional CELL read payload fields at runtime and in JSON Schema", () => {
    const event = {
      cycle: 7,
      seq: 2,
      type: "cell.read",
      scope: "pe0",
      entity_id: "pe0.bg.bank0.row3",
      payload: {
        request_id: 9,
        source: "cube",
        bytes: 128,
        result: "grant",
        arbitration_lane: 3,
      },
    } as const;

    expect(parseEvent(event).payload).toMatchObject({ arbitration_lane: 3 });

    const schema = JSON.parse(
      readFileSync(
        new URL("../schema/linxtrace-v1.schema.json", import.meta.url),
        "utf8",
      ),
    ) as { properties: { event: object } };
    const validateEvent = new Ajv().compile(schema.properties.event);

    expect(validateEvent(event), validateEvent.errors?.join("\n")).toBe(true);
  });

  test.each([
    { cycle: -1, seq: 0 },
    { cycle: 0, seq: -1 },
    { cycle: 1.5, seq: 0 },
    { cycle: Number.MAX_SAFE_INTEGER + 1, seq: 0 },
  ])("rejects invalid ordering fields: $cycle/$seq", ({ cycle, seq }) => {
    expect(() =>
      parseEvent({
        cycle,
        seq,
        type: "queue.full",
        scope: "pe0",
        entity_id: "x",
        payload: {},
      }),
    ).toThrow();
  });

  test("rejects an envelope field not defined by the contract", () => {
    expect(() =>
      parseEvent({
        cycle: 0,
        seq: 0,
        type: "queue.full",
        scope: "pe0",
        entity_id: "x",
        payload: {},
        timestamp: 10,
      }),
    ).toThrow();
  });

  test("rejects a payload that does not match its event discriminator", () => {
    expect(() =>
      parseEvent({
        cycle: 0,
        seq: 0,
        type: "cell.read",
        scope: "pe0",
        entity_id: "x",
        payload: { request_id: 9, source: "cube", bytes: 0, result: "miss" },
      }),
    ).toThrow();
  });
});

describe("manifest and index schemas", () => {
  test.each(["overview", "pipeline", "forensic"] as const)(
    "accepts the %s trace profile",
    (profile) => {
      expect(
        parseManifest({
          schemaVersion: "1.0.0",
          modelVersion: "superscalar-model@abc123",
          profile,
          firstCycle: 0,
          lastCycle: 4095,
          eventCount: 48,
          chunkCount: 1,
          chunkCycleSpan: 4096,
          checkpointCycleSpan: 4096,
        }).profile,
      ).toBe(profile);
    },
  );

  test("rejects a manifest with reversed cycle bounds", () => {
    expect(() =>
      parseManifest({
        schemaVersion: "1.0.0",
        modelVersion: "model",
        profile: "pipeline",
        firstCycle: 2,
        lastCycle: 1,
        eventCount: 0,
        chunkCount: 0,
        chunkCycleSpan: 4096,
        checkpointCycleSpan: 4096,
      }),
    ).toThrow(/lastCycle/);
  });

  test("parses chunk integrity and checkpoint metadata", () => {
    const index = parseIndex({
      schemaVersion: "1.0.0",
      chunks: [
        {
          path: "chunks/000000.jsonl.gz",
          firstCycle: 0,
          lastCycle: 4095,
          eventCount: 48,
          compressedBytes: 1024,
          sha256: "a".repeat(64),
          checkpointPath: "checkpoints/000000.json.gz",
        },
      ],
    });

    expect(index.chunks[0]?.eventCount).toBe(48);
  });
});

describe("schema compatibility", () => {
  test("accepts schema major version 1", () => {
    expect(() => assertCompatibleVersion("1.9.7")).not.toThrow();
  });

  test("rejects unsupported and malformed schema versions", () => {
    expect(() => assertCompatibleVersion("2.0.0")).toThrow(
      /unsupported schema major/,
    );
    expect(() => assertCompatibleVersion("v1")).toThrow(
      /invalid schema version/,
    );
  });
});

test("exports the canonical JSON Schema document", () => {
  const schema = JSON.parse(
    readFileSync(
      new URL("../schema/linxtrace-v1.schema.json", import.meta.url),
      "utf8",
    ),
  ) as {
    $id?: string;
    properties?: {
      event?: { oneOf?: unknown[] };
      manifest?: {
        properties?: {
          firstCycle?: { minimum?: number };
          schemaVersion?: { pattern?: string };
        };
      };
    };
  };

  expect(schema.$id).toBe(
    "https://linxisa.github.io/LinxSimCity/schema/linxtrace-v1.schema.json",
  );
  expect(schema.properties?.event?.oneOf).toHaveLength(48);
  expect(schema.properties?.manifest?.properties?.firstCycle?.minimum).toBe(0);
  expect(schema.properties?.manifest?.properties?.schemaVersion?.pattern).toBe(
    "^1\\.\\d+\\.\\d+$",
  );
});

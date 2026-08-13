import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { describe, expect, test } from "vitest";

import {
  TRACE_EVENT_TYPES,
  assertCompatibleVersion,
  parseEvent,
  parseIndex,
  parseManifest,
  parseStrings,
} from "./index.js";

describe("trace event schema", () => {
  test("requires detailed PRF causality when the capability is active", () => {
    const options = { capabilities: ["instruction-causality-v1"] } as const;
    const event = parseEvent(
      {
        cycle: 120,
        seq: 4,
        type: "register.read",
        scope: "scalar.prf",
        entity_id: "pe2.prf.reg37",
        payload: {
          instruction_id: 9812,
          thread_id: 2,
          phys_reg: 37,
          consumer_id: 9812,
          port: 1,
          role: "source",
        },
      },
      options,
    );

    expect(event.payload).toMatchObject({ phys_reg: 37, thread_id: 2 });
    expect(() =>
      parseEvent(
        {
          cycle: 120,
          seq: 5,
          type: "register.read",
          scope: "scalar.prf",
          entity_id: "pe2.prf.reg37",
          payload: {
            instruction_id: 9812,
            thread_id: -1,
            phys_reg: -1,
            consumer_id: 9812,
            port: 1,
            role: "source",
          },
        },
        options,
      ),
    ).toThrow();

  });

  test("keeps legacy payloads loose without a detailed capability", () => {
    expect(
      parseEvent({
        cycle: 120,
        seq: 4,
        type: "register.read",
        scope: "scalar.prf",
        entity_id: "legacy.prf",
        payload: { legacy_register_name: "r12" },
      }).payload,
    ).toEqual({ legacy_register_name: "r12" });
  });

  test.each(["cache.hit", "cache.fill"] as const)(
    "requires resolved set and way for a detailed %s",
    (type) => {
      expect(() =>
        parseEvent(
          {
            cycle: 9,
            seq: 0,
            type,
            scope: "shared.l1d",
            entity_id: "core.shared.l1d.set3.way1",
            payload: {
              request_id: 7,
              instruction_id: 42,
              thread_id: 1,
              cache_id: "core.shared.l1d",
              level: "l1d",
              operation: "load",
              line_address: 4096,
              line_bytes: 64,
              tag: 4,
              state: "valid",
            },
          },
          { capabilities: ["shared-cache-v1"] },
        ),
      ).toThrow();
    },
  );

  test("enforces the 128-byte CELL geometry under cell-128b-v1", () => {
    const event = {
      cycle: 10,
      seq: 0,
      type: "cell.read",
      scope: "pe3.bg",
      entity_id: "pe3.bg.bank7.row255",
      payload: {
        instruction_id: 42,
        request_id: 99,
        thread_id: 3,
        route_id: "route.cell.cube.pe3",
        phys_cell_id: 2047,
        pe: 3,
        bank: 7,
        row: 255,
        byte_offset: 0,
        bytes: 128,
        operation: "read",
        source: "cube",
        arbitration: "serve",
      },
    } as const;

    expect(
      parseEvent(event, { capabilities: ["cell-128b-v1"] }).payload,
    ).toMatchObject({ phys_cell_id: 2047, bytes: 128 });
    expect(() =>
      parseEvent(
        {
          ...event,
          payload: { ...event.payload, bytes: 129 },
        },
        { capabilities: ["cell-128b-v1"] },
      ),
    ).toThrow();

    expect(
      parseEvent(
        {
          ...event,
          entity_id: "pe3.bg.bank7.row2559",
          payload: {
            ...event.payload,
            phys_cell_id: 20479,
            row: 2559,
          },
        },
        { capabilities: ["cell-128b-v1"] },
      ).payload,
    ).toMatchObject({ phys_cell_id: 20479, row: 2559 });
  });

  test("requires a physical route for detailed pipe transfers", () => {
    expect(() =>
      parseEvent(
        {
          cycle: 12,
          seq: 0,
          type: "pipe.transfer",
          scope: "scalar",
          entity_id: "pipe.scalar.int0",
          payload: { instruction_id: 42, thread_id: 0 },
        },
        { capabilities: ["physical-layout-v1"] },
      ),
    ).toThrow();
  });

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
  test("parses the detailed trace capability set", () => {
    expect(
      parseManifest({
        schemaVersion: "1.1.0",
        modelVersion: "superscalar-model@abc123",
        profile: "forensic",
        firstCycle: 0,
        lastCycle: 4095,
        eventCount: 48,
        chunkCount: 1,
        chunkCycleSpan: 4096,
        checkpointCycleSpan: 4096,
        capabilities: [
          "instruction-causality-v1",
          "physical-layout-v1",
          "shared-cache-v1",
          "cell-128b-v1",
          "tlsu-detail-v1",
        ],
      }).capabilities,
    ).toEqual([
      "instruction-causality-v1",
      "physical-layout-v1",
      "shared-cache-v1",
      "cell-128b-v1",
      "tlsu-detail-v1",
    ]);
  });

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

describe("strings table schema", () => {
  test("accepts a dictionary of stable IDs to string values", () => {
    expect(parseStrings({ opcode_0: "add", stall_1: "queue full" })).toEqual({
      opcode_0: "add",
      stall_1: "queue full",
    });
  });

  test.each([null, [], 7, { opcode_0: 7 }, { nested: { value: "add" } }])(
    "rejects a non-string dictionary: %j",
    (value) => {
      expect(() => parseStrings(value)).toThrow();
    },
  );
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
          capabilities?: { items?: { type?: string } };
          firstCycle?: { minimum?: number };
          schemaVersion?: { pattern?: string };
        };
      };
      strings?: { additionalProperties?: { type?: string } };
    };
  };

  expect(schema.$id).toBe(
    "https://linxisa.github.io/LinxSimCity/schema/linxtrace-v1.schema.json",
  );
  expect(schema.properties?.event?.oneOf).toHaveLength(48);
  expect(schema.properties?.manifest?.properties?.firstCycle?.minimum).toBe(0);
  expect(
    schema.properties?.manifest?.properties?.capabilities?.items?.type,
  ).toBe("string");
  expect(schema.properties?.manifest?.properties?.schemaVersion?.pattern).toBe(
    "^1\\.\\d+\\.\\d+$",
  );
  expect(schema.properties?.strings?.additionalProperties?.type).toBe("string");
  const eventSchemas = schema.properties?.event?.oneOf as Array<{
    properties?: {
      payload?: { properties?: Record<string, unknown> };
    };
  }>;
  expect(
    eventSchemas.some(
      (eventSchema) =>
        eventSchema.properties?.payload?.properties?.instruction_id !==
        undefined,
    ),
  ).toBe(true);
});

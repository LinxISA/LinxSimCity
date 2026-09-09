import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
  parseSimTraceEvent,
  parseSimTraceEvents,
  parseSimTraceManifest,
} from "./current-schemas.js";
import type { SimTraceEvent, SimTraceManifest } from "./current-types.js";
import {
  type ValidateSimTraceOptions,
  validateSimTraceRun,
} from "./current-validate.js";

const positiveFixture = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/current/minimal.run.json", import.meta.url),
    "utf8",
  ),
) as { manifest: unknown; events: unknown[] };

const topologyFixture = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/current/minimal.topology.json", import.meta.url),
    "utf8",
  ),
) as { nodes: { id: string }[] };

const negativeCases = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/current/negative-cases.json", import.meta.url),
    "utf8",
  ),
) as { id: string; stage: string; expected: string }[];

const topologyNodeIds = new Set(topologyFixture.nodes.map((node) => node.id));

interface MutableRun {
  manifest: SimTraceManifest;
  events: SimTraceEvent[];
}

function parsedRun(): MutableRun {
  return {
    manifest: parseSimTraceManifest(structuredClone(positiveFixture.manifest)),
    events: parseSimTraceEvents(structuredClone(positiveFixture.events)),
  };
}

const validationOptions: ValidateSimTraceOptions = {
  topologyFingerprint: "fnv1a64:815740de3e4b867f",
  topologyNodeIds,
};

describe("current simulation trace contract", () => {
  test("exports the current standalone JSON Schema", () => {
    const schema = JSON.parse(
      readFileSync(
        new URL("../schema/linxsimcity-trace.schema.json", import.meta.url),
        "utf8",
      ),
    ) as {
      $id?: string;
      properties?: {
        event?: { oneOf?: unknown[] };
        manifest?: { properties?: { schema?: { const?: string } } };
      };
    };
    expect(schema.$id).toBe(
      "https://linxisa.github.io/LinxSimCity/schema/linxsimcity-trace.schema.json",
    );
    expect(schema.properties?.event?.oneOf).toHaveLength(16);
    expect(schema.properties?.manifest?.properties?.schema?.const).toBe(
      "linxsimcity.trace",
    );
  });

  test("accepts a complete queue, Tile residency, compute, and release flow", () => {
    const run = parsedRun();
    expect(validateSimTraceRun(run, validationOptions)).toEqual([]);
    expect(run.events.map((event) => event.type)).toContain("queue.visible");
    expect(run.events.map((event) => event.type)).toContain("tile.allocate");
    expect(run.events.map((event) => event.type)).toContain("compute.complete");
  });

  test("accepts the maximum lossless u64 string and rejects number coercion", () => {
    const event = structuredClone(positiveFixture.events[0]) as Record<
      string,
      unknown
    >;
    event.cycle = "18446744073709551615";
    expect(parseSimTraceEvent(event).cycle).toBe("18446744073709551615");
    event.cycle = "18446744073709551616";
    expect(() => parseSimTraceEvent(event)).toThrow(/unsigned 64-bit/);
    event.cycle = Number("18446744073709551615");
    expect(() => parseSimTraceEvent(event)).toThrow();
  });

  test.each(negativeCases)(
    "rejects malformed fixture $id at $stage",
    ({ id, stage, expected }) => {
      if (id === "old-format") {
        expect(() =>
          parseSimTraceManifest({
            schemaVersion: "1.0.0",
            modelVersion: "old-viewer",
          }),
        ).toThrow(/schema/);
        return;
      }
      if (id === "numeric-u64") {
        const event = structuredClone(positiveFixture.events[0]) as Record<
          string,
          unknown
        >;
        event.cycle = Number("9007199254740992");
        expect(() => parseSimTraceEvent(event)).toThrow();
        return;
      }
      if (id === "invalid-config-sha") {
        const manifest = structuredClone(positiveFixture.manifest) as {
          simulator: { configSha256: string };
        };
        manifest.simulator.configSha256 = "not-a-sha256";
        expect(() => parseSimTraceManifest(manifest)).toThrow();
        return;
      }

      const run = parsedRun();
      let options = validationOptions;
      if (id === "wrong-topology") {
        options = { ...validationOptions, topologyFingerprint: "wrong" };
      } else if (id === "out-of-order") {
        [run.events[1], run.events[2]] = [run.events[2]!, run.events[1]!];
      } else if (id === "duplicate-order-key") {
        const event = run.events[2]! as SimTraceEvent & {
          cycle: string;
          phase: "work";
          sequence: number;
        };
        event.cycle = "1";
        event.phase = "work";
        event.sequence = 0;
      } else if (id === "read-before-visible") {
        const read = structuredClone(run.events[5]!);
        const mutable = read as typeof read & {
          cycle: string;
          sequence: number;
        };
        mutable.cycle = "1";
        mutable.sequence = 0;
        run.events = [run.events[0]!, read];
        run.manifest = {
          ...run.manifest,
          eventCount: "2",
          window: { ...run.manifest.window, lastCycle: "1" },
        };
      } else if (id === "tile-double-allocate") {
        const duplicate = structuredClone(run.events[6]!);
        const mutable = duplicate as typeof duplicate & { sequence: number };
        mutable.sequence = 1;
        run.events = [
          ...run.events.slice(0, 7),
          duplicate,
          ...run.events.slice(7),
        ];
        run.manifest = { ...run.manifest, eventCount: "13" };
      } else if (id === "missing-entity") {
        const event = run.events[1]! as SimTraceEvent & {
          entityId: string;
        };
        event.entityId = "missing.node";
      } else if (id === "missing-capability") {
        run.manifest = {
          ...run.manifest,
          capabilities: run.manifest.capabilities.filter(
            (capability) => capability !== "queue-lifecycle",
          ),
        };
      } else if (id === "complete-with-loss") {
        run.manifest = {
          ...run.manifest,
          loss: {
            droppedEvents: "1",
            truncated: true,
            reason: "fixture loss",
          },
        };
      } else {
        throw new Error(`unhandled negative fixture ${id}`);
      }
      expect(stage).toBe("validate");
      expect(
        validateSimTraceRun(run, options).map((item) => item.code),
      ).toContain(expected);
    },
  );
});

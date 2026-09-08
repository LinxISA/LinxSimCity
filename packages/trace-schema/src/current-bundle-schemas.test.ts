import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";

import {
  parseSimTraceCheckpoint,
  parseSimTraceIndex,
} from "./current-bundle-schemas.js";

const fixture = new URL(
  "../../../fixtures/current/minimal.bundle/",
  import.meta.url,
);

describe("current trace bundle contract", () => {
  test("parses the strict index and checkpoint fixture", () => {
    const index = parseSimTraceIndex(
      JSON.parse(readFileSync(new URL("index.json", fixture), "utf8")),
    );
    const checkpoint = parseSimTraceCheckpoint(
      JSON.parse(
        gunzipSync(
          readFileSync(new URL(index.checkpoints[0]!.path, fixture)),
        ).toString("utf8"),
      ),
    );
    expect(index.schema).toBe("linxsimcity.trace-index");
    expect(index.chunks[0]?.eventCount).toBe("12");
    expect(checkpoint.schema).toBe("linxsimcity.trace-checkpoint");
    expect(checkpoint.state.queueOccupancy).toEqual([
      { queueId: "queue.ingress", occupancy: 0, capacity: 4 },
    ]);
  });

  test("rejects unsafe integers, unknown checkpoint IDs, and extra state", () => {
    const source = JSON.parse(
      readFileSync(new URL("index.json", fixture), "utf8"),
    ) as { chunks: { compressedBytes: number; checkpointId: string }[] };
    source.chunks[0]!.compressedBytes = Number.MAX_SAFE_INTEGER + 1;
    expect(() => parseSimTraceIndex(source)).toThrow();
    source.chunks[0]!.compressedBytes = 1;
    source.chunks[0]!.checkpointId = "missing";
    expect(() => parseSimTraceIndex(source)).toThrow(/unknown checkpoint/);

    const checkpoint = JSON.parse(
      gunzipSync(
        readFileSync(new URL("checkpoints/core-000.json.gz", fixture)),
      ).toString("utf8"),
    ) as { state: Record<string, unknown> };
    checkpoint.state.derivedViewerCache = {};
    expect(() => parseSimTraceCheckpoint(checkpoint)).toThrow();
  });

  test("exports index and checkpoint JSON Schema", () => {
    const schema = JSON.parse(
      readFileSync(
        new URL(
          "../schema/linxsimcity-trace-bundle.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as {
      properties?: Record<string, { properties?: Record<string, unknown> }>;
    };
    expect(schema.properties?.index?.properties).toHaveProperty("chunks");
    expect(schema.properties?.checkpoint?.properties).toHaveProperty("state");
  });
});

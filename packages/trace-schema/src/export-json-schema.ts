import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import {
  CheckpointStateSchema,
  EventSchema,
  TraceIndexSchema,
  TraceManifestSchema,
} from "./schemas.js";

export const TRACE_SCHEMA_ID =
  "https://linxisa.github.io/LinxSimCity/schema/linxtrace-v1.schema.json";

export function createTraceJsonSchema(): Record<string, unknown> {
  const contractSchema = z.strictObject({
    manifest: TraceManifestSchema,
    event: EventSchema,
    index: TraceIndexSchema,
    checkpoint: CheckpointStateSchema,
  });

  return {
    ...z.toJSONSchema(contractSchema, { target: "draft-2020-12" }),
    $id: TRACE_SCHEMA_ID,
    title: "LinxTrace v1 contract",
  };
}

const outputPath = fileURLToPath(
  new URL("../schema/linxtrace-v1.schema.json", import.meta.url),
);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(createTraceJsonSchema(), null, 2)}\n`,
);

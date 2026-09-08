import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { z } from "zod";

import {
  CheckpointStateSchema,
  EventSchema,
  StringsTableSchema,
  TraceIndexSchema,
  TraceManifestSchema,
} from "./schemas.js";
import {
  SimTraceEventSchema,
  SimTraceManifestSchema,
} from "./current-schemas.js";

export const TRACE_SCHEMA_ID =
  "https://linxisa.github.io/LinxSimCity/schema/linxtrace-v1.schema.json";

export function createTraceJsonSchema(): Record<string, unknown> {
  const contractSchema = z.strictObject({
    manifest: TraceManifestSchema,
    event: EventSchema,
    index: TraceIndexSchema,
    checkpoint: CheckpointStateSchema,
    strings: StringsTableSchema,
  });

  return {
    ...z.toJSONSchema(contractSchema, { target: "draft-2020-12" }),
    $id: TRACE_SCHEMA_ID,
    title: "LinxTrace v1 contract",
  };
}

export const SIM_TRACE_SCHEMA_ID =
  "https://linxisa.github.io/LinxSimCity/schema/linxsimcity-trace.schema.json";

export function createSimTraceJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(
      z.strictObject({
        manifest: SimTraceManifestSchema,
        event: SimTraceEventSchema,
      }),
      { target: "draft-2020-12" },
    ),
    $id: SIM_TRACE_SCHEMA_ID,
    title: "LinxSimCity simulation trace contract",
  };
}

const outputPath = fileURLToPath(
  new URL("../schema/linxtrace-v1.schema.json", import.meta.url),
);

mkdirSync(dirname(outputPath), { recursive: true });
const formattedSchema = await format(JSON.stringify(createTraceJsonSchema()), {
  parser: "json",
});
writeFileSync(outputPath, formattedSchema);

const simOutputPath = fileURLToPath(
  new URL("../schema/linxsimcity-trace.schema.json", import.meta.url),
);
const formattedSimSchema = await format(
  JSON.stringify(createSimTraceJsonSchema()),
  { parser: "json" },
);
writeFileSync(simOutputPath, formattedSimSchema);

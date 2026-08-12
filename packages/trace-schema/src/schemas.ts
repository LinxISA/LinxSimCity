import { z } from "zod";

import { assertCompatibleVersion } from "./compatibility.js";
import {
  TRACE_EVENT_TYPES,
  TRACE_PROFILES,
  type CheckpointState,
  type EventEnvelope,
  type TraceIndex,
  type TraceManifest,
} from "./types.js";

const nonNegativeSafeInteger = z.number().int().safe().nonnegative();
const positiveSafeInteger = z.number().int().safe().positive();
const nonEmptyString = z.string().min(1);
const schemaVersion = z
  .string()
  .regex(/^1\.\d+\.\d+$/)
  .superRefine((version, context) => {
    try {
      assertCompatibleVersion(version);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "invalid schema version",
      });
    }
  });

const genericPayloadSchema = z.looseObject({});
const cellReadPayloadSchema = z.looseObject({
  request_id: nonNegativeSafeInteger.optional(),
  source: nonEmptyString.optional(),
  bytes: positiveSafeInteger.optional(),
  result: z.enum(["grant", "conflict"]).optional(),
});

const eventVariants = TRACE_EVENT_TYPES.map((type) =>
  z.strictObject({
    cycle: nonNegativeSafeInteger,
    seq: nonNegativeSafeInteger,
    type: z.literal(type),
    scope: nonEmptyString,
    entity_id: nonEmptyString,
    payload:
      type === "cell.read" ? cellReadPayloadSchema : genericPayloadSchema,
  }),
);

export const EventSchema = z.discriminatedUnion(
  "type",
  eventVariants as unknown as Parameters<typeof z.discriminatedUnion>[1],
);

export const TraceManifestSchema = z
  .strictObject({
    schemaVersion,
    modelVersion: nonEmptyString,
    profile: z.enum(TRACE_PROFILES),
    firstCycle: nonNegativeSafeInteger,
    lastCycle: nonNegativeSafeInteger,
    eventCount: nonNegativeSafeInteger,
    chunkCount: nonNegativeSafeInteger,
    chunkCycleSpan: positiveSafeInteger,
    checkpointCycleSpan: positiveSafeInteger,
  })
  .refine((manifest) => manifest.lastCycle >= manifest.firstCycle, {
    message: "lastCycle must be greater than or equal to firstCycle",
    path: ["lastCycle"],
  });

export const ChunkIndexEntrySchema = z
  .strictObject({
    path: nonEmptyString,
    firstCycle: nonNegativeSafeInteger,
    lastCycle: nonNegativeSafeInteger,
    eventCount: nonNegativeSafeInteger,
    compressedBytes: nonNegativeSafeInteger,
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    checkpointPath: nonEmptyString,
  })
  .refine((chunk) => chunk.lastCycle >= chunk.firstCycle, {
    message: "lastCycle must be greater than or equal to firstCycle",
    path: ["lastCycle"],
  });

export const TraceIndexSchema = z.strictObject({
  schemaVersion,
  chunks: z.array(ChunkIndexEntrySchema),
});

export const CheckpointStateSchema = z.strictObject({
  cycle: nonNegativeSafeInteger,
  seq: nonNegativeSafeInteger,
  entities: z.record(z.string(), z.unknown()),
});

export function parseManifest(value: unknown): TraceManifest {
  return TraceManifestSchema.parse(value);
}

export function parseEvent(value: unknown): EventEnvelope {
  return EventSchema.parse(value) as EventEnvelope;
}

export function parseIndex(value: unknown): TraceIndex {
  return TraceIndexSchema.parse(value);
}

export function parseCheckpoint(value: unknown): CheckpointState {
  return CheckpointStateSchema.parse(value);
}

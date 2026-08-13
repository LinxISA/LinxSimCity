import { z } from "zod";

import { assertCompatibleVersion } from "./compatibility.js";
import type { ParseEventOptions } from "./detailed-payloads.js";
import {
  TRACE_EVENT_TYPES,
  TRACE_PROFILES,
  type CheckpointState,
  type EventEnvelope,
  type TraceIndex,
  type TraceManifest,
  type StringsTable,
} from "./types.js";

const nonNegativeSafeInteger = z.number().int().safe().nonnegative();
const positiveSafeInteger = z.number().int().safe().positive();
const nonEmptyString = z.string().min(1);
const threadId = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
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
const causalCompatibilityFields = {
  instruction_id: nonNegativeSafeInteger.optional(),
  request_id: nonNegativeSafeInteger.optional(),
  thread_id: threadId.optional(),
  route_id: nonEmptyString.optional(),
};
const instructionCompatibilityPayloadSchema = z.looseObject({
  ...causalCompatibilityFields,
  pc: nonNegativeSafeInteger.optional(),
  disassembly_id: nonEmptyString.optional(),
  bid: nonNegativeSafeInteger.optional(),
  rid: nonNegativeSafeInteger.optional(),
  rob_slot: nonNegativeSafeInteger.optional(),
  iq_slot: nonNegativeSafeInteger.optional(),
  stage_id: nonEmptyString.optional(),
  issue_port: nonNegativeSafeInteger.optional(),
  pipe_id: nonEmptyString.optional(),
  fu_kind: nonEmptyString.optional(),
  reason: nonEmptyString.optional(),
});
const registerCompatibilityPayloadSchema = z.looseObject({
  ...causalCompatibilityFields,
  phys_reg: nonNegativeSafeInteger.optional(),
  port: nonNegativeSafeInteger.optional(),
  role: z.enum(["source", "destination", "prior-mapping"]).optional(),
  producer_id: nonNegativeSafeInteger.optional(),
  consumer_id: nonNegativeSafeInteger.optional(),
  ready: z.boolean().optional(),
});
const cacheCompatibilityPayloadSchema = z.looseObject({
  ...causalCompatibilityFields,
  cache_id: nonEmptyString.optional(),
  level: z.enum(["l1i", "l1d", "l2"]).optional(),
  operation: z
    .enum(["fetch", "load", "store", "prefetch", "writeback"])
    .optional(),
  address: nonNegativeSafeInteger.optional(),
  line_address: nonNegativeSafeInteger.optional(),
  line_bytes: positiveSafeInteger.optional(),
  set: nonNegativeSafeInteger.optional(),
  way: nonNegativeSafeInteger.optional(),
  tag: nonNegativeSafeInteger.optional(),
  state: nonEmptyString.optional(),
  sub_access_index: nonNegativeSafeInteger.optional(),
});
const cellCompatibilityPayloadSchema = z.looseObject({
  ...causalCompatibilityFields,
  phys_cell_id: nonNegativeSafeInteger.optional(),
  pe: threadId.optional(),
  bank: nonNegativeSafeInteger.optional(),
  row: nonNegativeSafeInteger.optional(),
  byte_offset: nonNegativeSafeInteger.optional(),
  request_id: nonNegativeSafeInteger.optional(),
  source: nonEmptyString.optional(),
  bytes: positiveSafeInteger.optional(),
  result: z.enum(["grant", "conflict"]).optional(),
  operation: z.enum(["read", "write"]).optional(),
  arbitration: z.enum(["request", "grant", "conflict", "serve"]).optional(),
  queue_id: nonEmptyString.optional(),
  wait_cycles: nonNegativeSafeInteger.optional(),
});
const memoryCompatibilityPayloadSchema = z.looseObject({
  ...causalCompatibilityFields,
  operation: z.enum(["read", "write", "prefetch"]).optional(),
  stage_id: nonEmptyString.optional(),
  address: nonNegativeSafeInteger.optional(),
  bytes: positiveSafeInteger.optional(),
  source_entity_id: nonEmptyString.optional(),
  destination_entity_id: nonEmptyString.optional(),
});
const pipeCompatibilityPayloadSchema = z.looseObject({
  ...causalCompatibilityFields,
  start_cycle: nonNegativeSafeInteger.optional(),
  end_cycle: nonNegativeSafeInteger.optional(),
});

const DetailedInstructionPayloadSchema = z.looseObject({
  instruction_id: nonNegativeSafeInteger,
  thread_id: threadId,
  pc: nonNegativeSafeInteger,
  disassembly_id: nonEmptyString,
  request_id: nonNegativeSafeInteger.optional(),
  route_id: nonEmptyString.optional(),
  bid: nonNegativeSafeInteger.optional(),
  rid: nonNegativeSafeInteger.optional(),
  rob_slot: nonNegativeSafeInteger.optional(),
  iq_slot: nonNegativeSafeInteger.optional(),
  stage_id: nonEmptyString.optional(),
  issue_port: nonNegativeSafeInteger.optional(),
  pipe_id: nonEmptyString.optional(),
  fu_kind: nonEmptyString.optional(),
  reason: nonEmptyString.optional(),
});
const DetailedRegisterReadPayloadSchema = z.looseObject({
  instruction_id: nonNegativeSafeInteger,
  thread_id: threadId,
  phys_reg: nonNegativeSafeInteger,
  consumer_id: nonNegativeSafeInteger,
  port: nonNegativeSafeInteger,
  role: z.literal("source"),
  request_id: nonNegativeSafeInteger.optional(),
  route_id: nonEmptyString.optional(),
  producer_id: nonNegativeSafeInteger.optional(),
  ready: z.boolean().optional(),
});
const DetailedRegisterWritePayloadSchema = z.looseObject({
  instruction_id: nonNegativeSafeInteger,
  thread_id: threadId,
  phys_reg: nonNegativeSafeInteger,
  producer_id: nonNegativeSafeInteger,
  port: nonNegativeSafeInteger,
  role: z.enum(["destination", "prior-mapping"]),
  request_id: nonNegativeSafeInteger.optional(),
  route_id: nonEmptyString.optional(),
  consumer_id: nonNegativeSafeInteger.optional(),
  ready: z.boolean().optional(),
});
const DetailedRegisterReadyPayloadSchema = z.looseObject({
  thread_id: threadId,
  phys_reg: nonNegativeSafeInteger,
  ready: z.boolean(),
  instruction_id: nonNegativeSafeInteger.optional(),
  producer_id: nonNegativeSafeInteger.optional(),
  request_id: nonNegativeSafeInteger.optional(),
  route_id: nonEmptyString.optional(),
});
const DetailedCachePayloadSchema = z.looseObject({
  request_id: nonNegativeSafeInteger,
  instruction_id: nonNegativeSafeInteger.optional(),
  thread_id: threadId,
  route_id: nonEmptyString.optional(),
  cache_id: nonEmptyString,
  level: z.enum(["l1i", "l1d", "l2"]),
  operation: z.enum(["fetch", "load", "store", "prefetch", "writeback"]),
  address: nonNegativeSafeInteger.optional(),
  line_address: nonNegativeSafeInteger,
  line_bytes: positiveSafeInteger,
  set: nonNegativeSafeInteger,
  way: nonNegativeSafeInteger.optional(),
  tag: nonNegativeSafeInteger,
  state: nonEmptyString.optional(),
  sub_access_index: nonNegativeSafeInteger.optional(),
});
const ResolvedDetailedCachePayloadSchema = DetailedCachePayloadSchema.extend({
  way: nonNegativeSafeInteger,
});
const DetailedCellPayloadSchema = z
  .looseObject({
    instruction_id: nonNegativeSafeInteger.optional(),
    request_id: nonNegativeSafeInteger,
    thread_id: threadId,
    route_id: nonEmptyString.optional(),
    phys_cell_id: nonNegativeSafeInteger,
    pe: threadId,
    bank: z.number().int().min(0).max(7),
    row: nonNegativeSafeInteger,
    byte_offset: z.number().int().min(0).max(127),
    bytes: z.number().int().min(1).max(128),
    operation: z.enum(["read", "write"]),
    source: z.enum(["cube", "vector", "tlsu", "gmma-mov"]),
    arbitration: z.enum(["request", "grant", "conflict", "serve"]),
    queue_id: nonEmptyString.optional(),
    wait_cycles: nonNegativeSafeInteger.optional(),
    winner_request_id: nonNegativeSafeInteger.optional(),
    loser_request_ids: z.array(nonNegativeSafeInteger).optional(),
  })
  .superRefine((payload, context) => {
    if (payload.byte_offset + payload.bytes > 128) {
      context.addIssue({
        code: "custom",
        path: ["bytes"],
        message: "CELL access must stay within one 128-byte row",
      });
    }
    if (payload.phys_cell_id !== payload.bank + 8 * payload.row) {
      context.addIssue({
        code: "custom",
        path: ["phys_cell_id"],
        message: "phys_cell_id must equal bank + 8 * row",
      });
    }
    if (payload.pe !== payload.thread_id) {
      context.addIssue({
        code: "custom",
        path: ["pe"],
        message: "CELL pe must match thread_id",
      });
    }
  });
const DetailedMemoryPayloadSchema = z.looseObject({
  instruction_id: nonNegativeSafeInteger.optional(),
  request_id: nonNegativeSafeInteger,
  thread_id: threadId,
  route_id: nonEmptyString.optional(),
  operation: z.enum(["read", "write", "prefetch"]),
  stage_id: nonEmptyString,
  address: nonNegativeSafeInteger,
  bytes: positiveSafeInteger,
  source_entity_id: nonEmptyString,
  destination_entity_id: nonEmptyString,
});
const DetailedPipePayloadSchema = z
  .looseObject({
    instruction_id: nonNegativeSafeInteger.optional(),
    request_id: nonNegativeSafeInteger.optional(),
    thread_id: threadId,
    route_id: nonEmptyString,
    start_cycle: nonNegativeSafeInteger.optional(),
    end_cycle: nonNegativeSafeInteger.optional(),
  })
  .refine(
    (payload) =>
      payload.instruction_id !== undefined || payload.request_id !== undefined,
    { message: "pipe transfer must reference an instruction or request" },
  );

function compatibilityPayloadFor(type: (typeof TRACE_EVENT_TYPES)[number]) {
  if (type.startsWith("instruction.") || type.startsWith("pipeline.")) {
    return instructionCompatibilityPayloadSchema;
  }
  if (type.startsWith("register.")) {
    return registerCompatibilityPayloadSchema;
  }
  if (type.startsWith("cache.")) {
    return cacheCompatibilityPayloadSchema;
  }
  if (type.startsWith("cell.")) {
    return cellCompatibilityPayloadSchema;
  }
  if (type.startsWith("memory.")) {
    return memoryCompatibilityPayloadSchema;
  }
  if (type === "pipe.transfer") {
    return pipeCompatibilityPayloadSchema;
  }
  return genericPayloadSchema;
}

const eventVariants = TRACE_EVENT_TYPES.map((type) =>
  z.strictObject({
    cycle: nonNegativeSafeInteger,
    seq: nonNegativeSafeInteger,
    type: z.literal(type),
    scope: nonEmptyString,
    entity_id: nonEmptyString,
    payload: compatibilityPayloadFor(type),
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
    capabilities: z.array(nonEmptyString).optional(),
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

export const StringsTableSchema = z.record(nonEmptyString, z.string());

export const CheckpointStateSchema = z.strictObject({
  cycle: nonNegativeSafeInteger,
  seq: nonNegativeSafeInteger,
  entities: z.record(z.string(), z.unknown()),
});

export function parseManifest(value: unknown): TraceManifest {
  return TraceManifestSchema.parse(value);
}

export function parseEvent(
  value: unknown,
  options: ParseEventOptions = {},
): EventEnvelope {
  const parsed = EventSchema.parse(value) as EventEnvelope;
  const capabilities = new Set(options.capabilities ?? []);
  let payload = parsed.payload;

  if (
    capabilities.has("instruction-causality-v1") &&
    (parsed.type.startsWith("instruction.") ||
      parsed.type.startsWith("pipeline."))
  ) {
    payload = DetailedInstructionPayloadSchema.parse(payload);
  }
  if (
    capabilities.has("instruction-causality-v1") &&
    parsed.type === "register.read"
  ) {
    payload = DetailedRegisterReadPayloadSchema.parse(payload);
  }
  if (
    capabilities.has("instruction-causality-v1") &&
    parsed.type === "register.write"
  ) {
    payload = DetailedRegisterWritePayloadSchema.parse(payload);
  }
  if (
    capabilities.has("instruction-causality-v1") &&
    parsed.type === "register.ready"
  ) {
    payload = DetailedRegisterReadyPayloadSchema.parse(payload);
  }
  if (capabilities.has("shared-cache-v1") && parsed.type.startsWith("cache.")) {
    payload = (
      parsed.type === "cache.hit" || parsed.type === "cache.fill"
        ? ResolvedDetailedCachePayloadSchema
        : DetailedCachePayloadSchema
    ).parse(payload);
  }
  if (capabilities.has("cell-128b-v1") && parsed.type.startsWith("cell.")) {
    payload = DetailedCellPayloadSchema.parse(payload);
  }
  if (capabilities.has("tlsu-detail-v1") && parsed.type.startsWith("memory.")) {
    payload = DetailedMemoryPayloadSchema.parse(payload);
  }
  if (
    capabilities.has("physical-layout-v1") &&
    parsed.type === "pipe.transfer"
  ) {
    payload = DetailedPipePayloadSchema.parse(payload);
  }

  return { ...parsed, payload };
}

export function parseIndex(value: unknown): TraceIndex {
  return TraceIndexSchema.parse(value);
}

export function parseCheckpoint(value: unknown): CheckpointState {
  return CheckpointStateSchema.parse(value);
}

export function parseStrings(value: unknown): StringsTable {
  return StringsTableSchema.parse(value);
}

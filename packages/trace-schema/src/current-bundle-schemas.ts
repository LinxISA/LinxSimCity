import { z } from "zod";

import {
  SIM_TRACE_BUNDLE_VERSION,
  SIM_TRACE_CHECKPOINT_SCHEMA,
  SIM_TRACE_INDEX_SCHEMA,
  type SimTraceCheckpoint,
  type SimTraceIndex,
} from "./current-bundle-types.js";

const UINT64_MAX = 18_446_744_073_709_551_615n;
const nonEmpty = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const nonNegativeInteger = z.number().int().safe().nonnegative();
const positiveInteger = z.number().int().safe().positive();
const decimalU64 = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,19})$/)
  .refine((value) => BigInt(value) <= UINT64_MAX, "must fit unsigned 64-bit");

const chunk = z
  .strictObject({
    id: nonEmpty,
    path: nonEmpty,
    timeDomain: nonEmpty,
    firstCycle: decimalU64,
    lastCycle: decimalU64,
    eventCount: decimalU64,
    sha256,
    compressedBytes: positiveInteger,
    checkpointId: nonEmpty,
  })
  .refine((value) => BigInt(value.lastCycle) >= BigInt(value.firstCycle), {
    path: ["lastCycle"],
    message: "lastCycle must be greater than or equal to firstCycle",
  });

const checkpointIndexEntry = z.strictObject({
  id: nonEmpty,
  path: nonEmpty,
  timeDomain: nonEmpty,
  cycle: decimalU64,
  eventOrdinal: decimalU64,
  sha256,
  compressedBytes: positiveInteger,
});

export const SimTraceIndexSchema = z
  .strictObject({
    schema: z.literal(SIM_TRACE_INDEX_SCHEMA),
    schemaVersion: z.literal(SIM_TRACE_BUNDLE_VERSION),
    runId: nonEmpty,
    topologyFingerprint: nonEmpty,
    chunks: z.array(chunk),
    checkpoints: z.array(checkpointIndexEntry),
  })
  .superRefine((index, context) => {
    for (const [field, values] of [
      ["chunks", index.chunks.map((item) => item.id)],
      ["checkpoints", index.checkpoints.map((item) => item.id)],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} IDs must be unique`,
        });
      }
    }
    const paths = [
      ...index.chunks.map((item) => item.path),
      ...index.checkpoints.map((item) => item.path),
    ];
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: "custom",
        path: ["chunks"],
        message: "bundle file paths must be unique",
      });
    }
    const checkpointIds = new Set(index.checkpoints.map((item) => item.id));
    index.chunks.forEach((item, position) => {
      if (!checkpointIds.has(item.checkpointId)) {
        context.addIssue({
          code: "custom",
          path: ["chunks", position, "checkpointId"],
          message: "chunk references an unknown checkpoint",
        });
      }
    });
  });

const tileResidency = z
  .strictObject({
    residencyId: nonEmpty,
    tileId: nonEmpty,
    version: decimalU64,
    storageNodeId: nonEmpty,
    allocationEpoch: decimalU64,
    bank: nonNegativeInteger.optional(),
    row: nonNegativeInteger.optional(),
    slot: nonNegativeInteger.optional(),
    address: decimalU64.optional(),
    byteOffset: nonNegativeInteger,
    byteLength: positiveInteger,
    fragmentIndex: nonNegativeInteger,
    fragmentCount: positiveInteger,
    lastAccess: z
      .strictObject({
        type: z.enum(["read", "write"]),
        cycle: decimalU64,
        phase: z.enum(["work", "xfer", "commit", "async"]),
        tokenId: nonEmpty.optional(),
        byteOffset: nonNegativeInteger,
        byteLength: positiveInteger,
      })
      .optional(),
  })
  .refine((value) => value.fragmentIndex < value.fragmentCount, {
    path: ["fragmentIndex"],
    message: "fragmentIndex must be less than fragmentCount",
  });

export const SimTraceCheckpointStateSchema = z.strictObject({
  queueTokens: z.array(
    z.strictObject({
      tokenId: nonEmpty,
      queueId: nonEmpty,
      state: z.enum(["accepted", "visible"]),
      slot: nonNegativeInteger,
    }),
  ),
  queueOccupancy: z.array(
    z
      .strictObject({
        queueId: nonEmpty,
        occupancy: nonNegativeInteger,
        capacity: positiveInteger,
      })
      .refine((value) => value.occupancy <= value.capacity, {
        path: ["occupancy"],
        message: "queue occupancy cannot exceed capacity",
      }),
  ),
  tileResidencies: z.array(tileResidency),
  associations: z.array(
    z.strictObject({
      entityId: nonEmpty,
      tokenId: nonEmpty,
      tileId: nonEmpty,
      version: decimalU64,
      relation: z.enum(["produces", "consumes", "transfers"]),
    }),
  ),
  computations: z.array(
    z.strictObject({
      tokenId: nonEmpty,
      entityId: nonEmpty,
      operation: nonEmpty,
      inputTileIds: z.array(nonEmpty),
      outputTileIds: z.array(nonEmpty),
      startCycle: decimalU64,
      startPhase: z.enum(["work", "xfer", "commit", "async"]),
    }),
  ),
});

export const SimTraceCheckpointSchema = z.strictObject({
  schema: z.literal(SIM_TRACE_CHECKPOINT_SCHEMA),
  schemaVersion: z.literal(SIM_TRACE_BUNDLE_VERSION),
  runId: nonEmpty,
  topologyFingerprint: nonEmpty,
  timeDomain: nonEmpty,
  cycle: decimalU64,
  eventOrdinal: decimalU64,
  state: SimTraceCheckpointStateSchema,
});

export function parseSimTraceIndex(value: unknown): SimTraceIndex {
  return SimTraceIndexSchema.parse(value) as SimTraceIndex;
}

export function parseSimTraceCheckpoint(value: unknown): SimTraceCheckpoint {
  return SimTraceCheckpointSchema.parse(value) as SimTraceCheckpoint;
}

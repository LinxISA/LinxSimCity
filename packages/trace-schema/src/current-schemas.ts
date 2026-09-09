import { z } from "zod";

import {
  SIM_TRACE_CAPABILITIES,
  SIM_TRACE_EVENT_TYPES,
  SIM_TRACE_SCHEMA,
  SIM_TRACE_SCHEMA_VERSION,
  type SimTraceEvent,
  type SimTraceManifest,
} from "./current-types.js";

const UINT64_MAX = 18_446_744_073_709_551_615n;
const nonEmpty = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const nonNegativeInteger = z.number().int().safe().nonnegative();
const positiveInteger = z.number().int().safe().positive();
const decimalU64 = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,19})$/)
  .refine((value) => BigInt(value) <= UINT64_MAX, "must fit unsigned 64-bit");

export const SimTraceManifestSchema = z
  .strictObject({
    schema: z.literal(SIM_TRACE_SCHEMA),
    schemaVersion: z.literal(SIM_TRACE_SCHEMA_VERSION),
    runId: nonEmpty,
    topologyFingerprint: nonEmpty,
    simulator: z.strictObject({
      name: nonEmpty,
      revision: nonEmpty,
      configSha256: sha256,
    }),
    workload: z.strictObject({
      name: nonEmpty,
      sha256,
    }),
    timeDomains: z
      .array(
        z.strictObject({
          id: nonEmpty,
          unit: z.literal("cycle"),
          tickRatio: z.strictObject({
            numerator: positiveInteger,
            denominator: positiveInteger,
          }),
        }),
      )
      .min(1),
    window: z.strictObject({
      firstCycle: decimalU64,
      lastCycle: decimalU64,
      startsFromReset: z.boolean(),
      complete: z.boolean(),
    }),
    eventCount: decimalU64,
    capabilities: z.array(z.enum(SIM_TRACE_CAPABILITIES)),
    loss: z.strictObject({
      droppedEvents: decimalU64,
      truncated: z.boolean(),
      reason: nonEmpty.optional(),
    }),
  })
  .superRefine((manifest, context) => {
    if (
      BigInt(manifest.window.lastCycle) < BigInt(manifest.window.firstCycle)
    ) {
      context.addIssue({
        code: "custom",
        path: ["window", "lastCycle"],
        message: "lastCycle must be greater than or equal to firstCycle",
      });
    }
    if (
      (manifest.loss.truncated || BigInt(manifest.loss.droppedEvents) > 0n) &&
      !manifest.loss.reason
    ) {
      context.addIssue({
        code: "custom",
        path: ["loss", "reason"],
        message: "loss or truncation requires a reason",
      });
    }
    const domainIds = manifest.timeDomains.map((domain) => domain.id);
    if (new Set(domainIds).size !== domainIds.length) {
      context.addIssue({
        code: "custom",
        path: ["timeDomains"],
        message: "time domain IDs must be unique",
      });
    }
    if (new Set(manifest.capabilities).size !== manifest.capabilities.length) {
      context.addIssue({
        code: "custom",
        path: ["capabilities"],
        message: "capabilities must be unique",
      });
    }
  });

const commonEvent = {
  timeDomain: nonEmpty,
  cycle: decimalU64,
  phase: z.enum(["work", "xfer", "commit", "async"]),
  sequence: nonNegativeInteger,
  entityId: nonEmpty,
};

const queueState = {
  tokenId: nonEmpty,
  occupancy: nonNegativeInteger,
  capacity: positiveInteger,
};

const tileIdentity = {
  tileId: nonEmpty,
  version: decimalU64,
};

const tileLocation = {
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
};

const tileUse = {
  residencyId: nonEmpty,
  ...tileIdentity,
  tokenId: nonEmpty.optional(),
  byteOffset: nonNegativeInteger,
  byteLength: positiveInteger,
};

const eventVariants = [
  z.strictObject({
    ...commonEvent,
    type: z.literal("queue.write-attempt"),
    payload: z.strictObject({
      tokenId: nonEmpty,
      producerNodeId: nonEmpty,
    }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("queue.accept"),
    payload: z.strictObject({
      ...queueState,
      slot: nonNegativeInteger,
    }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("queue.visible"),
    payload: z.strictObject({
      ...queueState,
      slot: nonNegativeInteger,
    }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("queue.read"),
    payload: z.strictObject({
      ...queueState,
      slot: nonNegativeInteger,
      consumerNodeId: nonEmpty,
    }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("queue.backpressure"),
    payload: z.strictObject({
      tokenId: nonEmpty.optional(),
      occupancy: nonNegativeInteger,
      capacity: positiveInteger,
      reason: nonEmpty,
    }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("queue.cancel"),
    payload: z.strictObject({
      ...queueState,
      reason: nonEmpty,
    }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("tile.allocate"),
    payload: z.strictObject({
      residencyId: nonEmpty,
      ...tileIdentity,
      ...tileLocation,
      producerTokenId: nonEmpty.optional(),
    }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("tile.read"),
    payload: z.strictObject(tileUse),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("tile.write"),
    payload: z.strictObject(tileUse),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("tile.move"),
    payload: z.strictObject({
      residencyId: nonEmpty,
      toResidencyId: nonEmpty,
      ...tileIdentity,
      toStorageNodeId: nonEmpty,
      toAllocationEpoch: decimalU64,
      toBank: nonNegativeInteger.optional(),
      toRow: nonNegativeInteger.optional(),
      toSlot: nonNegativeInteger.optional(),
      toAddress: decimalU64.optional(),
      toByteOffset: nonNegativeInteger,
      toByteLength: positiveInteger,
      toFragmentIndex: nonNegativeInteger,
      toFragmentCount: positiveInteger,
      tokenId: nonEmpty.optional(),
    }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("tile.release"),
    payload: z.strictObject({
      residencyId: nonEmpty,
      ...tileIdentity,
      reason: nonEmpty,
    }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("link.associate"),
    payload: z.strictObject({
      tokenId: nonEmpty,
      ...tileIdentity,
      relation: z.enum(["produces", "consumes", "transfers"]),
    }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("compute.start"),
    payload: z.strictObject({
      tokenId: nonEmpty,
      operation: nonEmpty,
      inputTileIds: z.array(nonEmpty),
      outputTileIds: z.array(nonEmpty),
    }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("compute.complete"),
    payload: z.strictObject({
      tokenId: nonEmpty,
      operation: nonEmpty,
      outputTileIds: z.array(nonEmpty),
      outcome: z.enum(["completed", "cancelled", "fault"]),
    }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("run.reset"),
    payload: z.strictObject({ reason: nonEmpty }),
  }),
  z.strictObject({
    ...commonEvent,
    type: z.literal("run.flush"),
    payload: z.strictObject({
      reason: nonEmpty,
      tokenIds: z.array(nonEmpty),
    }),
  }),
] as const;

export const SimTraceEventSchema = z.discriminatedUnion(
  "type",
  eventVariants as unknown as Parameters<typeof z.discriminatedUnion>[1],
);

export function parseSimTraceManifest(value: unknown): SimTraceManifest {
  return SimTraceManifestSchema.parse(value);
}

export function parseSimTraceEvent(value: unknown): SimTraceEvent {
  return SimTraceEventSchema.parse(value) as SimTraceEvent;
}

export function parseSimTraceEvents(
  values: readonly unknown[],
): SimTraceEvent[] {
  return values.map(parseSimTraceEvent);
}

export function isSimTraceEventType(value: string): boolean {
  return (SIM_TRACE_EVENT_TYPES as readonly string[]).includes(value);
}

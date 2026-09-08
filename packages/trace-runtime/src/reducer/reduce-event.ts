import type { SimTraceEvent, SimTracePhase } from "@linxsimcity/trace-schema";

import {
  normalizeSnapshot,
  type AssociationSnapshot,
  type ComputationSnapshot,
  type QueueSnapshot,
  type SimTracePosition,
  type SimTraceSnapshot,
  type TileResidencySnapshot,
} from "./state.js";

const PHASE_ORDER: Readonly<Record<SimTracePhase, number>> = {
  work: 0,
  xfer: 1,
  commit: 2,
  async: 3,
};
type Payload = Record<string, unknown>;

function payload(event: SimTraceEvent): Payload {
  return event.payload as Payload;
}
function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}
function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number") throw new Error(`${field} must be a number`);
  return value;
}
function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function requiredStrings(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be a string array`);
  }
  return value as string[];
}

function comparePosition(
  position: SimTracePosition,
  event: SimTraceEvent,
): number {
  const previousCycle = BigInt(position.cycle);
  const currentCycle = BigInt(event.cycle);
  if (previousCycle !== currentCycle)
    return previousCycle < currentCycle ? -1 : 1;
  return (
    PHASE_ORDER[position.phase] - PHASE_ORDER[event.phase] ||
    position.sequence - event.sequence
  );
}

function advancePosition(
  positions: readonly SimTracePosition[],
  event: SimTraceEvent,
): readonly SimTracePosition[] {
  const existing = positions.find(
    (position) => position.timeDomain === event.timeDomain,
  );
  if (existing && existing.eventOrdinal !== "0") {
    const comparison = comparePosition(existing, event);
    if (comparison >= 0) {
      throw new Error(
        comparison === 0
          ? `duplicate event order key in ${event.timeDomain}`
          : `event precedes snapshot position in ${event.timeDomain}`,
      );
    }
  }
  return [
    ...positions.filter((position) => position.timeDomain !== event.timeDomain),
    {
      timeDomain: event.timeDomain,
      cycle: event.cycle,
      phase: event.phase,
      sequence: event.sequence,
      eventOrdinal: String(BigInt(existing?.eventOrdinal ?? "0") + 1n),
    },
  ];
}

function queueFor(
  queues: readonly QueueSnapshot[],
  event: SimTraceEvent,
  value: Payload,
): QueueSnapshot {
  return (
    queues.find(
      (queue) =>
        queue.timeDomain === event.timeDomain &&
        queue.queueId === event.entityId,
    ) ?? {
      timeDomain: event.timeDomain,
      queueId: event.entityId,
      occupancy: 0,
      capacity: typeof value.capacity === "number" ? value.capacity : 1,
      backpressure: { active: false, reason: null, tokenId: null },
      tokens: [],
    }
  );
}

function replaceQueue(
  snapshot: SimTraceSnapshot,
  queue: QueueSnapshot,
): SimTraceSnapshot {
  return {
    ...snapshot,
    queues: [
      ...snapshot.queues.filter(
        (candidate) =>
          candidate.timeDomain !== queue.timeDomain ||
          candidate.queueId !== queue.queueId,
      ),
      queue,
    ],
  };
}

function removeTokenState(
  snapshot: SimTraceSnapshot,
  timeDomain: string,
  tokenIds: ReadonlySet<string>,
): SimTraceSnapshot {
  return {
    ...snapshot,
    queues: snapshot.queues.map((queue) => {
      if (queue.timeDomain !== timeDomain) return queue;
      const tokens = queue.tokens.filter(
        (token) => !tokenIds.has(token.tokenId),
      );
      return {
        ...queue,
        tokens,
        occupancy: tokens.filter((token) => token.state !== "write-attempt")
          .length,
        backpressure:
          queue.backpressure.tokenId && tokenIds.has(queue.backpressure.tokenId)
            ? { active: false, reason: null, tokenId: null }
            : queue.backpressure,
      };
    }),
    associations: snapshot.associations.filter(
      (item) => item.timeDomain !== timeDomain || !tokenIds.has(item.tokenId),
    ),
    computations: snapshot.computations.map((item) =>
      item.timeDomain === timeDomain &&
      tokenIds.has(item.tokenId) &&
      item.status === "active"
        ? { ...item, status: "cancelled" as const }
        : item,
    ),
  };
}

function reduceQueue(
  snapshot: SimTraceSnapshot,
  event: SimTraceEvent,
  value: Payload,
): SimTraceSnapshot {
  const queue = queueFor(snapshot.queues, event, value);
  const tokenId = optionalText(value.tokenId);
  let next = queue;
  if (event.type === "queue.write-attempt") {
    const id = requiredText(tokenId, "tokenId");
    next = {
      ...queue,
      tokens: [
        ...queue.tokens.filter((token) => token.tokenId !== id),
        { tokenId: id, state: "write-attempt", slot: null },
      ],
    };
  } else if (event.type === "queue.accept" || event.type === "queue.visible") {
    const id = requiredText(tokenId, "tokenId");
    next = {
      ...queue,
      occupancy: requiredNumber(value.occupancy, "occupancy"),
      capacity: requiredNumber(value.capacity, "capacity"),
      backpressure: { active: false, reason: null, tokenId: null },
      tokens: [
        ...queue.tokens.filter((token) => token.tokenId !== id),
        {
          tokenId: id,
          state: event.type === "queue.accept" ? "accepted" : "visible",
          slot: requiredNumber(value.slot, "slot"),
        },
      ],
    };
  } else if (event.type === "queue.read") {
    next = {
      ...queue,
      occupancy: requiredNumber(value.occupancy, "occupancy"),
      capacity: requiredNumber(value.capacity, "capacity"),
      backpressure: { active: false, reason: null, tokenId: null },
      tokens: queue.tokens.filter((token) => token.tokenId !== tokenId),
    };
  } else if (event.type === "queue.backpressure") {
    next = {
      ...queue,
      occupancy: requiredNumber(value.occupancy, "occupancy"),
      capacity: requiredNumber(value.capacity, "capacity"),
      backpressure: {
        active: true,
        reason: requiredText(value.reason, "reason"),
        tokenId: tokenId ?? null,
      },
    };
  } else if (event.type === "queue.cancel") {
    const id = requiredText(tokenId, "tokenId");
    snapshot = removeTokenState(snapshot, event.timeDomain, new Set([id]));
    next = {
      ...queue,
      occupancy: requiredNumber(value.occupancy, "occupancy"),
      capacity: requiredNumber(value.capacity, "capacity"),
      tokens: queue.tokens.filter((token) => token.tokenId !== id),
      backpressure:
        queue.backpressure.tokenId === id
          ? { active: false, reason: null, tokenId: null }
          : queue.backpressure,
    };
    snapshot = {
      ...snapshot,
      cancellations: [
        ...snapshot.cancellations,
        {
          timeDomain: event.timeDomain,
          cycle: event.cycle,
          queueId: event.entityId,
          tokenId: id,
          reason: requiredText(value.reason, "reason"),
        },
      ],
    };
  }
  return replaceQueue(snapshot, next);
}

function residency(
  event: SimTraceEvent,
  value: Payload,
): TileResidencySnapshot {
  const base: TileResidencySnapshot = {
    timeDomain: event.timeDomain,
    residencyId: requiredText(value.residencyId, "residencyId"),
    tileId: requiredText(value.tileId, "tileId"),
    version: requiredText(value.version, "version"),
    storageNodeId: requiredText(value.storageNodeId, "storageNodeId"),
    allocationEpoch: requiredText(value.allocationEpoch, "allocationEpoch"),
    byteOffset: requiredNumber(value.byteOffset, "byteOffset"),
    byteLength: requiredNumber(value.byteLength, "byteLength"),
    fragmentIndex: requiredNumber(value.fragmentIndex, "fragmentIndex"),
    fragmentCount: requiredNumber(value.fragmentCount, "fragmentCount"),
  };
  const bank = optionalNumber(value.bank);
  const row = optionalNumber(value.row);
  const slot = optionalNumber(value.slot);
  const address = optionalText(value.address);
  return {
    ...base,
    ...(bank === undefined ? {} : { bank }),
    ...(row === undefined ? {} : { row }),
    ...(slot === undefined ? {} : { slot }),
    ...(address === undefined ? {} : { address }),
  };
}

function reduceTile(
  snapshot: SimTraceSnapshot,
  event: SimTraceEvent,
  value: Payload,
): SimTraceSnapshot {
  const id = requiredText(value.residencyId, "residencyId");
  if (event.type === "tile.read" || event.type === "tile.write") {
    const tokenId = optionalText(value.tokenId);
    return {
      ...snapshot,
      tileResidencies: snapshot.tileResidencies.map((item) =>
        item.timeDomain === event.timeDomain && item.residencyId === id
          ? {
              ...item,
              lastAccess: {
                type: event.type === "tile.read" ? "read" : "write",
                cycle: event.cycle,
                phase: event.phase,
                ...(tokenId === undefined ? {} : { tokenId }),
                byteOffset: requiredNumber(value.byteOffset, "byteOffset"),
                byteLength: requiredNumber(value.byteLength, "byteLength"),
              },
            }
          : item,
      ),
    };
  }
  if (event.type === "tile.release") {
    return {
      ...snapshot,
      tileResidencies: snapshot.tileResidencies.filter(
        (item) =>
          item.timeDomain !== event.timeDomain || item.residencyId !== id,
      ),
    };
  }
  const item =
    event.type === "tile.allocate"
      ? residency(event, value)
      : residency(event, {
          residencyId: value.toResidencyId,
          tileId: value.tileId,
          version: value.version,
          storageNodeId: value.toStorageNodeId,
          allocationEpoch: value.toAllocationEpoch,
          bank: value.toBank,
          row: value.toRow,
          slot: value.toSlot,
          address: value.toAddress,
          byteOffset: value.toByteOffset,
          byteLength: value.toByteLength,
          fragmentIndex: value.toFragmentIndex,
          fragmentCount: value.toFragmentCount,
        });
  return {
    ...snapshot,
    tileResidencies: [
      ...snapshot.tileResidencies.filter(
        (candidate) =>
          candidate.timeDomain !== event.timeDomain ||
          (candidate.residencyId !== id &&
            candidate.residencyId !== item.residencyId),
      ),
      item,
    ],
  };
}

function reduceAssociation(
  snapshot: SimTraceSnapshot,
  event: SimTraceEvent,
  value: Payload,
): SimTraceSnapshot {
  const item: AssociationSnapshot = {
    timeDomain: event.timeDomain,
    entityId: event.entityId,
    tokenId: requiredText(value.tokenId, "tokenId"),
    tileId: requiredText(value.tileId, "tileId"),
    version: requiredText(value.version, "version"),
    relation: requiredText(
      value.relation,
      "relation",
    ) as AssociationSnapshot["relation"],
  };
  return {
    ...snapshot,
    associations: [
      ...snapshot.associations.filter(
        (candidate) =>
          candidate.timeDomain !== item.timeDomain ||
          candidate.tokenId !== item.tokenId ||
          candidate.tileId !== item.tileId ||
          candidate.version !== item.version ||
          candidate.relation !== item.relation,
      ),
      item,
    ],
  };
}

function reduceCompute(
  snapshot: SimTraceSnapshot,
  event: SimTraceEvent,
  value: Payload,
): SimTraceSnapshot {
  const tokenId = requiredText(value.tokenId, "tokenId");
  const existing = snapshot.computations.find(
    (item) => item.timeDomain === event.timeDomain && item.tokenId === tokenId,
  );
  const item: ComputationSnapshot =
    event.type === "compute.start"
      ? {
          timeDomain: event.timeDomain,
          tokenId,
          entityId: event.entityId,
          operation: requiredText(value.operation, "operation"),
          inputTileIds: requiredStrings(value.inputTileIds, "inputTileIds"),
          outputTileIds: requiredStrings(value.outputTileIds, "outputTileIds"),
          startCycle: event.cycle,
          startPhase: event.phase,
          status: "active",
        }
      : {
          timeDomain: event.timeDomain,
          tokenId,
          entityId: existing?.entityId ?? event.entityId,
          operation: requiredText(value.operation, "operation"),
          inputTileIds: existing?.inputTileIds ?? [],
          outputTileIds: requiredStrings(value.outputTileIds, "outputTileIds"),
          startCycle: existing?.startCycle ?? event.cycle,
          startPhase: existing?.startPhase ?? event.phase,
          status: requiredText(
            value.outcome,
            "outcome",
          ) as ComputationSnapshot["status"],
          completionCycle: event.cycle,
          completionPhase: event.phase,
        };
  return {
    ...snapshot,
    computations: [
      ...snapshot.computations.filter(
        (candidate) =>
          candidate.timeDomain !== event.timeDomain ||
          candidate.tokenId !== tokenId,
      ),
      item,
    ],
  };
}

export function reduceEvent(
  snapshot: SimTraceSnapshot,
  event: SimTraceEvent,
): SimTraceSnapshot {
  let next: SimTraceSnapshot = {
    ...snapshot,
    positions: advancePosition(snapshot.positions, event),
  };
  const value = payload(event);
  if (event.type === "run.reset") {
    next = {
      ...next,
      queues: next.queues.map((queue) =>
        queue.timeDomain === event.timeDomain
          ? {
              ...queue,
              occupancy: 0,
              backpressure: { active: false, reason: null, tokenId: null },
              tokens: [],
            }
          : queue,
      ),
      tileResidencies: next.tileResidencies.filter(
        (item) => item.timeDomain !== event.timeDomain,
      ),
      associations: next.associations.filter(
        (item) => item.timeDomain !== event.timeDomain,
      ),
      computations: next.computations.filter(
        (item) => item.timeDomain !== event.timeDomain,
      ),
      resets: [
        ...next.resets.filter((item) => item.timeDomain !== event.timeDomain),
        {
          timeDomain: event.timeDomain,
          cycle: event.cycle,
          reason: requiredText(value.reason, "reason"),
        },
      ],
      flushes: next.flushes.filter(
        (item) => item.timeDomain !== event.timeDomain,
      ),
      cancellations: next.cancellations.filter(
        (item) => item.timeDomain !== event.timeDomain,
      ),
    };
  } else if (event.type === "run.flush") {
    const tokenIds = requiredStrings(value.tokenIds, "tokenIds");
    next = removeTokenState(next, event.timeDomain, new Set(tokenIds));
    next = {
      ...next,
      flushes: [
        ...next.flushes,
        {
          timeDomain: event.timeDomain,
          cycle: event.cycle,
          reason: requiredText(value.reason, "reason"),
          tokenIds,
        },
      ],
    };
  } else if (event.type.startsWith("queue.")) {
    next = reduceQueue(next, event, value);
  } else if (event.type.startsWith("tile.")) {
    next = reduceTile(next, event, value);
  } else if (event.type === "link.associate") {
    next = reduceAssociation(next, event, value);
  } else if (event.type.startsWith("compute.")) {
    next = reduceCompute(next, event, value);
  }
  return normalizeSnapshot(next);
}

export function reduceEvents(
  snapshot: SimTraceSnapshot,
  events: readonly SimTraceEvent[],
): SimTraceSnapshot {
  return events.reduce(reduceEvent, snapshot);
}

import type { DecimalU64, SimTracePhase } from "@linxsimcity/trace-schema";
import type { ArchitectureTopology } from "@linxsimcity/world";

export interface SimTracePosition {
  readonly timeDomain: string;
  readonly cycle: DecimalU64;
  readonly phase: SimTracePhase;
  readonly sequence: number;
  readonly eventOrdinal: DecimalU64;
}

export interface QueueTokenSnapshot {
  readonly tokenId: string;
  readonly state: "write-attempt" | "accepted" | "visible";
  readonly slot: number | null;
}

export interface QueueSnapshot {
  readonly timeDomain: string;
  readonly queueId: string;
  readonly occupancy: number;
  readonly capacity: number;
  readonly backpressure: {
    readonly active: boolean;
    readonly reason: string | null;
    readonly tokenId: string | null;
  };
  readonly tokens: readonly QueueTokenSnapshot[];
}

export interface TileResidencySnapshot {
  readonly timeDomain: string;
  readonly residencyId: string;
  readonly tileId: string;
  readonly version: DecimalU64;
  readonly storageNodeId: string;
  readonly allocationEpoch: DecimalU64;
  readonly bank?: number | undefined;
  readonly row?: number | undefined;
  readonly slot?: number | undefined;
  readonly address?: DecimalU64 | undefined;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly fragmentIndex: number;
  readonly fragmentCount: number;
  readonly lastAccess?:
    | {
        readonly type: "read" | "write";
        readonly cycle: DecimalU64;
        readonly phase: SimTracePhase;
        readonly tokenId?: string | undefined;
        readonly byteOffset: number;
        readonly byteLength: number;
      }
    | undefined;
}

export interface AssociationSnapshot {
  readonly timeDomain: string;
  readonly entityId: string;
  readonly tokenId: string;
  readonly tileId: string;
  readonly version: DecimalU64;
  readonly relation: "produces" | "consumes" | "transfers";
}

export interface ComputationSnapshot {
  readonly timeDomain: string;
  readonly tokenId: string;
  readonly entityId: string;
  readonly operation: string;
  readonly inputTileIds: readonly string[];
  readonly outputTileIds: readonly string[];
  readonly startCycle: DecimalU64;
  readonly startPhase: SimTracePhase;
  readonly status: "active" | "completed" | "cancelled" | "fault";
  readonly completionCycle?: DecimalU64 | undefined;
  readonly completionPhase?: SimTracePhase | undefined;
}

export interface SimTraceSnapshot {
  readonly positions: readonly SimTracePosition[];
  readonly queues: readonly QueueSnapshot[];
  readonly tileResidencies: readonly TileResidencySnapshot[];
  readonly associations: readonly AssociationSnapshot[];
  readonly computations: readonly ComputationSnapshot[];
  readonly resets: readonly {
    readonly timeDomain: string;
    readonly cycle: DecimalU64;
    readonly reason: string;
  }[];
  readonly flushes: readonly {
    readonly timeDomain: string;
    readonly cycle: DecimalU64;
    readonly reason: string;
    readonly tokenIds: readonly string[];
  }[];
  readonly cancellations: readonly {
    readonly timeDomain: string;
    readonly cycle: DecimalU64;
    readonly queueId: string;
    readonly tokenId: string;
    readonly reason: string;
  }[];
}

function queueCapacity(node: ArchitectureTopology["nodes"][number]): number {
  const capacity = node.parameters.capacity;
  return typeof capacity === "number" &&
    Number.isSafeInteger(capacity) &&
    capacity > 0
    ? capacity
    : 1;
}

export function initialSnapshot(
  topology: ArchitectureTopology,
  timeDomains: readonly string[] = [],
): SimTraceSnapshot {
  const queues = timeDomains.flatMap((timeDomain) =>
    topology.nodes
      .filter((node) => node.definitionId.toLowerCase().includes("queue"))
      .map((node) => ({
        timeDomain,
        queueId: node.id,
        occupancy: 0,
        capacity: queueCapacity(node),
        backpressure: { active: false, reason: null, tokenId: null },
        tokens: [],
      })),
  );
  return normalizeSnapshot({
    positions: timeDomains.map((timeDomain) => ({
      timeDomain,
      cycle: "0",
      phase: "work",
      sequence: 0,
      eventOrdinal: "0",
    })),
    queues,
    tileResidencies: [],
    associations: [],
    computations: [],
    resets: [],
    flushes: [],
    cancellations: [],
  });
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareU64(left: DecimalU64, right: DecimalU64): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function normalizeSnapshot(
  snapshot: SimTraceSnapshot,
): SimTraceSnapshot {
  return {
    positions: [...snapshot.positions].sort((a, b) =>
      compareText(a.timeDomain, b.timeDomain),
    ),
    queues: [...snapshot.queues]
      .map((queue) => ({
        ...queue,
        tokens: [...queue.tokens].sort(
          (a, b) =>
            (a.slot ?? Number.MAX_SAFE_INTEGER) -
              (b.slot ?? Number.MAX_SAFE_INTEGER) ||
            compareText(a.tokenId, b.tokenId),
        ),
      }))
      .sort(
        (a, b) =>
          compareText(a.timeDomain, b.timeDomain) ||
          compareText(a.queueId, b.queueId),
      ),
    tileResidencies: [...snapshot.tileResidencies].sort(
      (a, b) =>
        compareText(a.timeDomain, b.timeDomain) ||
        compareText(a.residencyId, b.residencyId),
    ),
    associations: [...snapshot.associations].sort(
      (a, b) =>
        compareText(a.timeDomain, b.timeDomain) ||
        compareText(a.entityId, b.entityId) ||
        compareText(a.tokenId, b.tokenId) ||
        compareText(a.tileId, b.tileId) ||
        compareU64(a.version, b.version) ||
        compareText(a.relation, b.relation),
    ),
    computations: [...snapshot.computations].sort(
      (a, b) =>
        compareText(a.timeDomain, b.timeDomain) ||
        compareText(a.tokenId, b.tokenId),
    ),
    resets: [...snapshot.resets].sort(
      (a, b) =>
        compareText(a.timeDomain, b.timeDomain) || compareU64(a.cycle, b.cycle),
    ),
    flushes: [...snapshot.flushes]
      .map((flush) => ({
        ...flush,
        tokenIds: [...flush.tokenIds].sort(compareText),
      }))
      .sort(
        (a, b) =>
          compareText(a.timeDomain, b.timeDomain) ||
          compareU64(a.cycle, b.cycle),
      ),
    cancellations: [...snapshot.cancellations].sort(
      (a, b) =>
        compareText(a.timeDomain, b.timeDomain) ||
        compareU64(a.cycle, b.cycle) ||
        compareText(a.tokenId, b.tokenId),
    ),
  };
}

export function snapshotStateHash(snapshot: SimTraceSnapshot): string {
  const text = stableJson(normalizeSnapshot(snapshot));
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

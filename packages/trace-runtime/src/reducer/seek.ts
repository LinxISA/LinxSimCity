import type {
  DecimalU64,
  SimTraceCheckpoint,
  SimTraceCheckpointIndexEntry,
  SimTraceChunkIndexEntry,
  SimTraceEvent,
  SimTraceIndex,
  SimTraceManifest,
  SimTracePhase,
} from "@linxsimcity/trace-schema";
import type { ArchitectureTopology } from "@linxsimcity/topology";

import { restoreCheckpoint } from "./checkpoint.js";
import { reduceEvents } from "./reduce-event.js";
import {
  initialSnapshot,
  normalizeSnapshot,
  type SimTraceSnapshot,
} from "./state.js";

export interface SimTraceBundleReaderInterface {
  readManifest(signal?: AbortSignal): Promise<SimTraceManifest>;
  readTopology(signal?: AbortSignal): Promise<ArchitectureTopology>;
  readIndex(signal?: AbortSignal): Promise<SimTraceIndex>;
  readChunk(
    chunk: SimTraceChunkIndexEntry,
    signal?: AbortSignal,
  ): Promise<readonly SimTraceEvent[]>;
  readCheckpoint(
    checkpoint: SimTraceCheckpointIndexEntry,
    signal?: AbortSignal,
  ): Promise<SimTraceCheckpoint>;
}

export interface SimTraceSeekTarget {
  readonly timeDomain: string;
  readonly cycle: DecimalU64;
  readonly phase?: SimTracePhase | undefined;
  readonly sequence?: number | undefined;
}

export class SeekError extends Error {
  constructor(
    readonly code:
      | "target_out_of_range"
      | "unknown_time_domain"
      | "checkpoint_not_found"
      | "chunk_not_found",
    message: string,
  ) {
    super(message);
    this.name = "SeekError";
  }
}

const PHASE_ORDER: Readonly<Record<SimTracePhase, number>> = {
  work: 0,
  xfer: 1,
  commit: 2,
  async: 3,
};

function eventAtOrBefore(
  event: SimTraceEvent,
  target: SimTraceSeekTarget,
): boolean {
  const eventCycle = BigInt(event.cycle);
  const targetCycle = BigInt(target.cycle);
  if (eventCycle !== targetCycle) return eventCycle < targetCycle;
  const targetPhase = target.phase ?? "async";
  if (event.phase !== targetPhase) {
    return PHASE_ORDER[event.phase] < PHASE_ORDER[targetPhase];
  }
  return event.sequence <= (target.sequence ?? Number.MAX_SAFE_INTEGER);
}

function selectCheckpoint(index: SimTraceIndex, target: SimTraceSeekTarget) {
  return index.checkpoints
    .filter(
      (item) =>
        item.timeDomain === target.timeDomain &&
        BigInt(item.cycle) <= BigInt(target.cycle),
    )
    .sort((left, right) => {
      const cycleDifference = BigInt(right.cycle) - BigInt(left.cycle);
      if (cycleDifference !== 0n) return cycleDifference > 0n ? 1 : -1;
      const ordinalDifference =
        BigInt(right.eventOrdinal) - BigInt(left.eventOrdinal);
      return ordinalDifference > 0n ? 1 : ordinalDifference < 0n ? -1 : 0;
    })[0];
}

function chunksFromCheckpoint(
  index: SimTraceIndex,
  checkpointId: string,
  target: SimTraceSeekTarget,
): readonly SimTraceChunkIndexEntry[] {
  const domainChunks = index.chunks
    .filter((chunk) => chunk.timeDomain === target.timeDomain)
    .sort((left, right) => {
      const difference = BigInt(left.firstCycle) - BigInt(right.firstCycle);
      return difference < 0n
        ? -1
        : difference > 0n
          ? 1
          : left.id.localeCompare(right.id);
    });
  const first = domainChunks.findIndex(
    (chunk) => chunk.checkpointId === checkpointId,
  );
  if (first < 0) {
    throw new SeekError(
      "chunk_not_found",
      `checkpoint ${checkpointId} has no replay chunk`,
    );
  }
  return domainChunks
    .slice(first)
    .filter((chunk) => BigInt(chunk.firstCycle) <= BigInt(target.cycle));
}

function validateTargets(
  manifest: SimTraceManifest,
  targets: readonly SimTraceSeekTarget[],
): void {
  const domains = new Set(manifest.timeDomains.map((domain) => domain.id));
  const seen = new Set<string>();
  for (const target of targets) {
    if (!domains.has(target.timeDomain)) {
      throw new SeekError(
        "unknown_time_domain",
        `unknown time domain ${target.timeDomain}`,
      );
    }
    if (seen.has(target.timeDomain)) {
      throw new SeekError(
        "unknown_time_domain",
        `duplicate target for time domain ${target.timeDomain}`,
      );
    }
    seen.add(target.timeDomain);
    if (
      BigInt(target.cycle) < BigInt(manifest.window.firstCycle) ||
      BigInt(target.cycle) > BigInt(manifest.window.lastCycle)
    ) {
      throw new SeekError(
        "target_out_of_range",
        `cycle ${target.cycle} is outside ${manifest.window.firstCycle}..${manifest.window.lastCycle}`,
      );
    }
  }
}

export function withTargetPositions(
  snapshot: SimTraceSnapshot,
  targets: readonly SimTraceSeekTarget[],
): SimTraceSnapshot {
  return normalizeSnapshot({
    ...snapshot,
    positions: [
      ...snapshot.positions.filter(
        (position) =>
          !targets.some((target) => target.timeDomain === position.timeDomain),
      ),
      ...targets.map((target) => {
        const existing = snapshot.positions.find(
          (position) => position.timeDomain === target.timeDomain,
        );
        return {
          timeDomain: target.timeDomain,
          cycle: target.cycle,
          phase: target.phase ?? "async",
          sequence: target.sequence ?? Number.MAX_SAFE_INTEGER,
          eventOrdinal: existing?.eventOrdinal ?? "0",
        };
      }),
    ],
  });
}

export async function seekToTargets(
  reader: SimTraceBundleReaderInterface,
  targets: readonly SimTraceSeekTarget[],
  signal?: AbortSignal,
): Promise<SimTraceSnapshot> {
  signal?.throwIfAborted();
  const [manifest, topology, index] = await Promise.all([
    reader.readManifest(signal),
    reader.readTopology(signal),
    reader.readIndex(signal),
  ]);
  validateTargets(manifest, targets);
  let snapshot = initialSnapshot(
    topology,
    manifest.timeDomains.map((domain) => domain.id),
  );
  for (const target of [...targets].sort((a, b) =>
    a.timeDomain.localeCompare(b.timeDomain),
  )) {
    const checkpointEntry = selectCheckpoint(index, target);
    if (!checkpointEntry) {
      throw new SeekError(
        "checkpoint_not_found",
        `no checkpoint precedes ${target.timeDomain} cycle ${target.cycle}`,
      );
    }
    signal?.throwIfAborted();
    const checkpoint = await reader.readCheckpoint(checkpointEntry, signal);
    snapshot = restoreCheckpoint(snapshot, checkpoint);
    for (const chunk of chunksFromCheckpoint(
      index,
      checkpointEntry.id,
      target,
    )) {
      signal?.throwIfAborted();
      const events = (await reader.readChunk(chunk, signal)).filter(
        (event) =>
          event.timeDomain === target.timeDomain &&
          eventAtOrBefore(event, target),
      );
      snapshot = reduceEvents(snapshot, events);
    }
  }
  return withTargetPositions(snapshot, targets);
}

export async function seekToCycle(
  reader: SimTraceBundleReaderInterface,
  timeDomain: string,
  cycle: DecimalU64,
  signal?: AbortSignal,
): Promise<SimTraceSnapshot> {
  return seekToTargets(reader, [{ timeDomain, cycle }], signal);
}

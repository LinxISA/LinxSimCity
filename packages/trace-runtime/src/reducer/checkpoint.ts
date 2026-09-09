import {
  SIM_TRACE_BUNDLE_VERSION,
  SIM_TRACE_CHECKPOINT_SCHEMA,
  type SimTraceCheckpoint,
  type SimTraceCheckpointState,
} from "@linxsimcity/trace-schema";

import {
  normalizeSnapshot,
  type ComputationSnapshot,
  type SimTraceSnapshot,
} from "./state.js";

export interface CheckpointIdentity {
  readonly runId: string;
  readonly topologyFingerprint: string;
  readonly timeDomain: string;
}

export function snapshotToCheckpoint(
  snapshot: SimTraceSnapshot,
  identity: CheckpointIdentity,
): SimTraceCheckpoint {
  const position = snapshot.positions.find(
    (item) => item.timeDomain === identity.timeDomain,
  );
  if (!position) {
    throw new Error(`snapshot has no position for ${identity.timeDomain}`);
  }
  const queues = snapshot.queues.filter(
    (queue) => queue.timeDomain === identity.timeDomain,
  );
  const state: SimTraceCheckpointState = {
    queueTokens: queues.flatMap((queue) =>
      queue.tokens.flatMap((token) =>
        token.state === "write-attempt" || token.slot === null
          ? []
          : [
              {
                tokenId: token.tokenId,
                queueId: queue.queueId,
                state: token.state,
                slot: token.slot,
              },
            ],
      ),
    ),
    queueOccupancy: queues.map((queue) => ({
      queueId: queue.queueId,
      occupancy: queue.occupancy,
      capacity: queue.capacity,
    })),
    tileResidencies: snapshot.tileResidencies
      .filter((item) => item.timeDomain === identity.timeDomain)
      .map((item) => ({
        residencyId: item.residencyId,
        tileId: item.tileId,
        version: item.version,
        storageNodeId: item.storageNodeId,
        allocationEpoch: item.allocationEpoch,
        ...(item.bank === undefined ? {} : { bank: item.bank }),
        ...(item.row === undefined ? {} : { row: item.row }),
        ...(item.slot === undefined ? {} : { slot: item.slot }),
        ...(item.address === undefined ? {} : { address: item.address }),
        byteOffset: item.byteOffset,
        byteLength: item.byteLength,
        fragmentIndex: item.fragmentIndex,
        fragmentCount: item.fragmentCount,
        ...(item.lastAccess === undefined
          ? {}
          : { lastAccess: item.lastAccess }),
      })),
    associations: snapshot.associations
      .filter((item) => item.timeDomain === identity.timeDomain)
      .map((item) => ({
        entityId: item.entityId,
        tokenId: item.tokenId,
        tileId: item.tileId,
        version: item.version,
        relation: item.relation,
      })),
    computations: snapshot.computations
      .filter(
        (item) =>
          item.timeDomain === identity.timeDomain && item.status === "active",
      )
      .map((item) => ({
        tokenId: item.tokenId,
        entityId: item.entityId,
        operation: item.operation,
        inputTileIds: item.inputTileIds,
        outputTileIds: item.outputTileIds,
        startCycle: item.startCycle,
        startPhase: item.startPhase,
      })),
  };
  return {
    schema: SIM_TRACE_CHECKPOINT_SCHEMA,
    schemaVersion: SIM_TRACE_BUNDLE_VERSION,
    runId: identity.runId,
    topologyFingerprint: identity.topologyFingerprint,
    timeDomain: identity.timeDomain,
    cycle: position.cycle,
    eventOrdinal: position.eventOrdinal,
    state,
  };
}

function restoredComputations(
  checkpoint: SimTraceCheckpoint,
): readonly ComputationSnapshot[] {
  return checkpoint.state.computations.map((item) => ({
    ...item,
    timeDomain: checkpoint.timeDomain,
    status: "active",
  }));
}

export function restoreCheckpoint(
  snapshot: SimTraceSnapshot,
  checkpoint: SimTraceCheckpoint,
): SimTraceSnapshot {
  const domain = checkpoint.timeDomain;
  const tokenByQueue = new Map<string, typeof checkpoint.state.queueTokens>();
  for (const token of checkpoint.state.queueTokens) {
    tokenByQueue.set(token.queueId, [
      ...(tokenByQueue.get(token.queueId) ?? []),
      token,
    ]);
  }
  return normalizeSnapshot({
    ...snapshot,
    positions: [
      ...snapshot.positions.filter((item) => item.timeDomain !== domain),
      {
        timeDomain: domain,
        cycle: checkpoint.cycle,
        phase: "work",
        sequence: -1,
        eventOrdinal: checkpoint.eventOrdinal,
      },
    ],
    queues: [
      ...snapshot.queues.filter((item) => item.timeDomain !== domain),
      ...checkpoint.state.queueOccupancy.map((item) => ({
        timeDomain: domain,
        queueId: item.queueId,
        occupancy: item.occupancy,
        capacity: item.capacity,
        backpressure: { active: false, reason: null, tokenId: null },
        tokens: (tokenByQueue.get(item.queueId) ?? []).map((token) => ({
          tokenId: token.tokenId,
          state: token.state,
          slot: token.slot,
        })),
      })),
    ],
    tileResidencies: [
      ...snapshot.tileResidencies.filter((item) => item.timeDomain !== domain),
      ...checkpoint.state.tileResidencies.map((item) => ({
        ...item,
        timeDomain: domain,
      })),
    ],
    associations: [
      ...snapshot.associations.filter((item) => item.timeDomain !== domain),
      ...checkpoint.state.associations.map((item) => ({
        ...item,
        timeDomain: domain,
      })),
    ],
    computations: [
      ...snapshot.computations.filter((item) => item.timeDomain !== domain),
      ...restoredComputations(checkpoint),
    ],
    resets: snapshot.resets.filter((item) => item.timeDomain !== domain),
    flushes: snapshot.flushes.filter((item) => item.timeDomain !== domain),
    cancellations: snapshot.cancellations.filter(
      (item) => item.timeDomain !== domain,
    ),
  });
}

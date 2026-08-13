import type { CheckpointState } from "@linxsimcity/trace-schema";

import {
  deserializeCausalState,
  serializeCausalState,
} from "../causal/types.js";
import type { EntityState, ViewerSnapshot } from "./state.js";

export const CAUSAL_CHECKPOINT_KEY = "__linxsimcity.causal.v1";

function checkpointEntity(existing: EntityState, value: unknown): EntityState {
  if (typeof value !== "object" || value === null) {
    return { ...existing, data: { checkpoint: value } };
  }
  const record = value as Record<string, unknown>;
  const status =
    typeof record.status === "string" ? record.status : existing.status;
  return {
    ...existing,
    status,
    steadyStatus:
      typeof record.steadyStatus === "string" ? record.steadyStatus : status,
    available:
      typeof record.available === "boolean"
        ? record.available
        : existing.available,
    occupancy:
      typeof record.occupancy === "number"
        ? record.occupancy
        : existing.occupancy,
    stage: typeof record.stage === "string" ? record.stage : existing.stage,
    lastEvent:
      typeof record.lastEvent === "object" && record.lastEvent !== null
        ? (record.lastEvent as EntityState["lastEvent"])
        : existing.lastEvent,
    data:
      typeof record.data === "object" && record.data !== null
        ? (record.data as Record<string, unknown>)
        : record,
  };
}

export function snapshotToCheckpoint(
  snapshot: ViewerSnapshot,
  seq = 0,
): CheckpointState {
  const entities: Record<string, unknown> = {};
  for (const [id, entity] of snapshot.entities) {
    entities[id] = {
      status: entity.status,
      steadyStatus: entity.steadyStatus,
      available: entity.available,
      occupancy: entity.occupancy,
      stage: entity.stage,
      lastEvent: entity.lastEvent,
      data: entity.data,
    };
  }
  entities[CAUSAL_CHECKPOINT_KEY] = serializeCausalState(snapshot.causal);
  return { cycle: snapshot.cycle, seq, entities };
}

export function restoreCheckpoint(
  snapshot: ViewerSnapshot,
  checkpoint: CheckpointState,
): ViewerSnapshot {
  const entities = new Map(snapshot.entities);
  const changed: string[] = [];
  for (const [id, value] of Object.entries(checkpoint.entities)) {
    if (id === CAUSAL_CHECKPOINT_KEY) continue;
    const existing = entities.get(id);
    if (!existing) continue;
    entities.set(id, checkpointEntity(existing, value));
    changed.push(id);
  }
  return {
    ...snapshot,
    cycle: checkpoint.cycle,
    entities,
    activeEvents: [],
    changedEntityIds: changed.sort(),
    transientEntityIds: new Set(
      [...entities.values()]
        .filter((entity) => entity.status !== entity.steadyStatus)
        .map((entity) => entity.id),
    ),
    causal:
      checkpoint.entities[CAUSAL_CHECKPOINT_KEY] === undefined
        ? snapshot.causal
        : deserializeCausalState(checkpoint.entities[CAUSAL_CHECKPOINT_KEY]),
  };
}

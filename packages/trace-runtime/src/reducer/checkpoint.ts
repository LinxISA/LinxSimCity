import type { CheckpointState } from "@linxsimcity/trace-schema";

import type { EntityState, ViewerSnapshot } from "./state.js";

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
    steadyStatus: status,
    available:
      typeof record.available === "boolean"
        ? record.available
        : existing.available,
    occupancy:
      typeof record.occupancy === "number"
        ? record.occupancy
        : existing.occupancy,
    stage: typeof record.stage === "string" ? record.stage : existing.stage,
    data:
      typeof record.data === "object" && record.data !== null
        ? (record.data as Record<string, unknown>)
        : record,
  };
}

export function restoreCheckpoint(
  snapshot: ViewerSnapshot,
  checkpoint: CheckpointState,
): ViewerSnapshot {
  const entities = new Map(snapshot.entities);
  const changed: string[] = [];
  for (const [id, value] of Object.entries(checkpoint.entities)) {
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
    transientEntityIds: new Set(),
  };
}

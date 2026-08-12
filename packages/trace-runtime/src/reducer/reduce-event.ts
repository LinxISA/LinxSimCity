import type { EventEnvelope, TraceEventType } from "@linxsimcity/trace-schema";

import type { EntityState, ViewerSnapshot } from "./state.js";

const TRANSIENT_STATUS = new Map<TraceEventType, string>([
  ["instruction.fetch", "fetch"],
  ["instruction.decode", "decode"],
  ["instruction.rename", "rename"],
  ["instruction.dispatch", "dispatch"],
  ["instruction.issue", "issue"],
  ["instruction.complete", "complete"],
  ["instruction.retire", "retire"],
  ["instruction.squash", "squash"],
  ["pipeline.enter", "active"],
  ["pipeline.leave", "leave"],
  ["pipeline.stall", "stalled"],
  ["queue.full", "full"],
  ["rob.head", "head"],
  ["rob.tail", "tail"],
  ["rob.retire", "retire"],
  ["rob.flush", "flush"],
  ["register.read", "read"],
  ["register.write", "write"],
  ["register.ready", "ready"],
  ["cache.access", "access"],
  ["cache.hit", "hit"],
  ["cache.miss", "miss"],
  ["cache.fill", "fill"],
  ["cache.writeback", "writeback"],
  ["cell.read", "read"],
  ["cell.write", "write"],
  ["cell.grant", "grant"],
  ["cell.conflict", "conflict"],
  ["crossbar.request", "request"],
  ["crossbar.grant", "grant"],
  ["cube.dispatch", "dispatch"],
  ["cube.stage", "active"],
  ["cube.complete", "complete"],
  ["cube.writeback", "writeback"],
  ["vector.dispatch", "dispatch"],
  ["vector.stage", "active"],
  ["vector.complete", "complete"],
  ["vector.writeback", "writeback"],
  ["memory.request", "request"],
  ["memory.response", "response"],
  ["pipe.transfer", "transfer"],
  ["flush.begin", "flush"],
  ["flush.end", "recovered"],
  ["marker.user", "marked"],
]);

const STEADY_STATUS = new Map<TraceEventType, string>([
  ["queue.allocate", "occupied"],
  ["queue.release", "idle"],
  ["queue.occupancy", "occupied"],
  ["rob.allocate", "allocated"],
]);

function payloadRecord(payload: unknown): Readonly<Record<string, unknown>> {
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : { value: payload };
}

function resetTransientEntities(
  snapshot: ViewerSnapshot,
  entities: Map<string, EntityState>,
  changed: Set<string>,
): void {
  for (const id of snapshot.transientEntityIds) {
    const entity = entities.get(id);
    if (!entity || entity.status === entity.steadyStatus) continue;
    entities.set(id, { ...entity, status: entity.steadyStatus });
    changed.add(id);
  }
}

export function reduceEvent(
  snapshot: ViewerSnapshot,
  event: EventEnvelope,
): ViewerSnapshot {
  if (event.cycle < snapshot.cycle) {
    throw new Error(
      `event cycle ${event.cycle} precedes snapshot cycle ${snapshot.cycle}`,
    );
  }

  const entities = new Map(snapshot.entities);
  const changed = new Set<string>();
  const crossedCycle = event.cycle !== snapshot.cycle;
  if (crossedCycle) resetTransientEntities(snapshot, entities, changed);

  const current = entities.get(event.entity_id);
  if (!current) {
    throw new Error(`event references missing entity: ${event.entity_id}`);
  }

  const transientStatus = TRANSIENT_STATUS.get(event.type);
  const steadyStatus = STEADY_STATUS.get(event.type);
  const status = transientStatus ?? steadyStatus ?? "active";
  const payload = payloadRecord(event.payload);
  const occupancy =
    typeof payload.occupancy === "number"
      ? payload.occupancy
      : current.occupancy;
  const stage =
    typeof payload.stage === "string" ? payload.stage : current.stage;
  entities.set(event.entity_id, {
    ...current,
    status,
    steadyStatus: steadyStatus ?? current.steadyStatus,
    occupancy,
    stage,
    lastEvent: event,
    data: { ...current.data, ...payload },
  });
  changed.add(event.entity_id);

  const transientEntityIds = crossedCycle
    ? new Set<string>()
    : new Set(snapshot.transientEntityIds);
  if (transientStatus !== undefined || steadyStatus === undefined) {
    transientEntityIds.add(event.entity_id);
  } else {
    transientEntityIds.delete(event.entity_id);
  }

  return {
    ...snapshot,
    cycle: event.cycle,
    entities,
    activeEvents: crossedCycle ? [event] : [...snapshot.activeEvents, event],
    changedEntityIds: [...changed].sort(),
    transientEntityIds,
  };
}

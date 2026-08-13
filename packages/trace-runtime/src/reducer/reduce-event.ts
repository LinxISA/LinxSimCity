import type { EventEnvelope, TraceEventType } from "@linxsimcity/trace-schema";

import type { EntityState, ViewerSnapshot } from "./state.js";
import { reduceCausalEvent } from "../causal/reduce-causal.js";

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

export function reduceEvents(
  snapshot: ViewerSnapshot,
  events: readonly EventEnvelope[],
): ViewerSnapshot {
  if (events.length === 0) return snapshot;

  const entities = new Map(snapshot.entities);
  let current = { ...snapshot, entities };
  for (const event of events) {
    if (event.cycle < current.cycle) {
      throw new Error(
        `event cycle ${event.cycle} precedes snapshot cycle ${current.cycle}`,
      );
    }

    const changed = new Set<string>();
    const crossedCycle = event.cycle !== current.cycle;
    if (crossedCycle) resetTransientEntities(current, entities, changed);

    const currentEntity = entities.get(event.entity_id);
    if (!currentEntity) {
      throw new Error(`event references missing entity: ${event.entity_id}`);
    }

    const transientStatus = TRANSIENT_STATUS.get(event.type);
    const steadyStatus = STEADY_STATUS.get(event.type);
    const status = transientStatus ?? steadyStatus ?? "active";
    const payload = payloadRecord(event.payload);
    const occupancy =
      typeof payload.occupancy === "number"
        ? payload.occupancy
        : currentEntity.occupancy;
    const stage =
      typeof payload.stage === "string" ? payload.stage : currentEntity.stage;
    entities.set(event.entity_id, {
      ...currentEntity,
      status,
      steadyStatus: steadyStatus ?? currentEntity.steadyStatus,
      occupancy,
      stage,
      lastEvent: event,
      data: { ...currentEntity.data, ...payload },
    });
    changed.add(event.entity_id);

    const transientEntityIds = crossedCycle
      ? new Set<string>()
      : new Set(current.transientEntityIds);
    if (transientStatus !== undefined || steadyStatus === undefined) {
      transientEntityIds.add(event.entity_id);
    } else {
      transientEntityIds.delete(event.entity_id);
    }

    current = {
      ...current,
      cycle: event.cycle,
      entities,
      activeEvents: crossedCycle ? [event] : [...current.activeEvents, event],
      changedEntityIds: [...changed].sort(),
      transientEntityIds,
      causal: reduceCausalEvent(current.causal, event),
    };
  }

  return current;
}

export function reduceEvent(
  snapshot: ViewerSnapshot,
  event: EventEnvelope,
): ViewerSnapshot {
  return reduceEvents(snapshot, [event]);
}

import type { EventEnvelope, TraceProfile } from "@linxsimcity/trace-schema";
import type {
  TopologyDescriptor,
  TopologyEntityKind,
} from "@linxsimcity/topology";

export interface EntityState {
  readonly id: string;
  readonly label: string;
  readonly kind: TopologyEntityKind;
  readonly status: string;
  readonly steadyStatus: string;
  readonly available: boolean;
  readonly occupancy?: number | undefined;
  readonly stage?: string | undefined;
  readonly lastEvent?: EventEnvelope;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ViewerSnapshot {
  readonly cycle: number;
  readonly entities: ReadonlyMap<string, EntityState>;
  readonly activeEvents: readonly EventEnvelope[];
  readonly changedEntityIds: readonly string[];
  readonly transientEntityIds: ReadonlySet<string>;
  readonly profileAvailability: Readonly<Record<TraceProfile, boolean>>;
}

export interface SerializableSnapshot {
  readonly cycle: number;
  readonly entities: readonly EntityState[];
  readonly activeEvents: readonly EventEnvelope[];
  readonly changedEntityIds: readonly string[];
}

export function initialSnapshot(topology: TopologyDescriptor): ViewerSnapshot {
  const entities = new Map<string, EntityState>();
  for (const entity of topology.entities) {
    entities.set(entity.id, {
      id: entity.id,
      label: entity.label,
      kind: entity.kind,
      status: "idle",
      steadyStatus: "idle",
      available: true,
      data: {},
    });
  }
  return {
    cycle: 0,
    entities,
    activeEvents: [],
    changedEntityIds: [],
    transientEntityIds: new Set(),
    profileAvailability: { overview: true, pipeline: true, forensic: true },
  };
}

export function snapshotToObject(
  snapshot: ViewerSnapshot,
): SerializableSnapshot {
  return {
    cycle: snapshot.cycle,
    entities: [...snapshot.entities.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    activeEvents: [...snapshot.activeEvents],
    changedEntityIds: [...snapshot.changedEntityIds].sort(),
  };
}

export function withSnapshotCycle(
  snapshot: ViewerSnapshot,
  cycle: number,
): ViewerSnapshot {
  if (snapshot.cycle === cycle) return snapshot;
  return { ...snapshot, cycle, activeEvents: [], changedEntityIds: [] };
}

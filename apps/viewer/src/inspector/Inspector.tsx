import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";

import type { ViewerMode } from "../player/types.js";
import { DemoInspector } from "./DemoInspector.js";
import { ExpertInspector } from "./ExpertInspector.js";

interface InspectorProps {
  readonly mode: ViewerMode;
  readonly selectedEntityId?: string | undefined;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly topology?: TopologyDescriptor | undefined;
}

export function Inspector({
  mode,
  selectedEntityId,
  snapshot,
  topology,
}: InspectorProps) {
  if (!selectedEntityId || !snapshot || !topology) {
    return (
      <div className="inspector-empty">
        <span className="eyebrow">LIVE INSPECTOR</span>
        <h2>Select a building</h2>
        <p>
          Pick a module, ROB slot, cache line, CELL, MAC, or pipe in the city.
        </p>
      </div>
    );
  }
  const entity = topology.entities.find(
    (candidate) => candidate.id === selectedEntityId,
  );
  const state = snapshot.entities.find(([id]) => id === selectedEntityId)?.[1];
  if (!entity || !state || !state.available) {
    return (
      <div className="inspector-empty">
        <h2>Data unavailable</h2>
        <p>
          This hardware exists in the topology but is unavailable in this trace
          profile.
        </p>
      </div>
    );
  }
  const currentEvent = snapshot.activeEvents.find(
    (event) => event.entity_id === selectedEntityId,
  );
  return (
    <>
      <DemoInspector
        entity={entity}
        state={state}
        currentEvent={currentEvent}
      />
      {mode === "expert" ? (
        <ExpertInspector
          entity={entity}
          state={state}
          currentEvent={currentEvent}
          availability={snapshot.profileAvailability}
        />
      ) : null}
    </>
  );
}

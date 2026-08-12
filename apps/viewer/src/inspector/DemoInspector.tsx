import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type { EntityState } from "@linxsimcity/trace-runtime";
import type { TopologyEntity } from "@linxsimcity/topology";

interface DemoInspectorProps {
  readonly entity: TopologyEntity;
  readonly state: EntityState;
  readonly currentEvent?: EventEnvelope | undefined;
}

export function DemoInspector({
  entity,
  state,
  currentEvent,
}: DemoInspectorProps) {
  return (
    <div className="demo-inspector">
      <span className="eyebrow">SELECTED HARDWARE</span>
      <h2>{entity.label}</h2>
      <div className={`state-badge state-${state.status}`}>{state.status}</div>
      <dl className="state-summary">
        <div>
          <dt>Kind</dt>
          <dd>{entity.kind}</dd>
        </div>
        <div>
          <dt>Occupancy</dt>
          <dd>{state.occupancy ?? "—"}</dd>
        </div>
        <div>
          <dt>Current event</dt>
          <dd>{currentEvent?.type ?? "No event this cycle"}</dd>
        </div>
      </dl>
    </div>
  );
}

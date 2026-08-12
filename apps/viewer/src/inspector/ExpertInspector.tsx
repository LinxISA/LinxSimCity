import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type {
  EntityState,
  SerializedViewerSnapshot,
} from "@linxsimcity/trace-runtime";
import type { TopologyEntity } from "@linxsimcity/topology";

interface ExpertInspectorProps {
  readonly entity: TopologyEntity;
  readonly state: EntityState;
  readonly currentEvent?: EventEnvelope | undefined;
  readonly availability: SerializedViewerSnapshot["profileAvailability"];
}

export function ExpertInspector({
  entity,
  state,
  currentEvent,
  availability,
}: ExpertInspectorProps) {
  return (
    <div className="expert-inspector">
      <span className="entity-id">{entity.id}</span>
      <dl className="expert-fields">
        <div>
          <dt>Instance</dt>
          <dd>{JSON.stringify(entity.instance)}</dd>
        </div>
        <div>
          <dt>Ports</dt>
          <dd>{entity.ports?.map((port) => port.id).join(", ") || "—"}</dd>
        </div>
        <div>
          <dt>Stage</dt>
          <dd>{state.stage ?? "—"}</dd>
        </div>
        <div>
          <dt>request_id</dt>
          <dd>{String(state.data.request_id ?? "—")}</dd>
        </div>
        <div>
          <dt>Stall reason</dt>
          <dd>{String(state.data.stall_reason ?? "—")}</dd>
        </div>
      </dl>
      {!availability.forensic ? (
        <p className="profile-unavailable">
          Forensic profile unavailable for this trace.
        </p>
      ) : null}
      <details open>
        <summary>Raw event payload</summary>
        <pre>
          {JSON.stringify(currentEvent?.payload ?? state.data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

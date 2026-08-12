import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";

interface SceneViewportProps {
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly topology?: TopologyDescriptor | undefined;
}

export function SceneViewport({ snapshot, topology }: SceneViewportProps) {
  return (
    <section className="scene-viewport" aria-label="Architecture city viewport">
      <div className="scene-grid" aria-hidden="true" />
      <div className="scene-placeholder">
        <span className="eyebrow">WEBGL CITY BOUNDARY</span>
        <strong>Cycle {snapshot?.cycle ?? "—"}</strong>
        <small>
          {topology?.entities.length ?? 0} entities ·{" "}
          {snapshot?.changedEntityIds.length ?? 0} changed
        </small>
      </div>
    </section>
  );
}

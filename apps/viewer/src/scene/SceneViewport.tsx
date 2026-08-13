import { SceneCanvas, type CameraFocus } from "@linxsimcity/scene-core";
import { City } from "@linxsimcity/scene-modules";
import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useState } from "react";

import { usePlayerStore } from "../player/player-store.js";

interface SceneViewportProps {
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly topology?: TopologyDescriptor | undefined;
}

const EMPTY_TOPOLOGY: TopologyDescriptor = {
  schemaVersion: "1.0.0",
  entities: [],
};

export const focusOptions: readonly { id: CameraFocus; label: string }[] = [
  { id: "city", label: "Core" },
  { id: "scalar", label: "Scalar" },
  { id: "vector", label: "Vector" },
  { id: "cell", label: "CELL" },
  { id: "cube", label: "CUBE" },
  { id: "tlsu", label: "TLSU" },
];

export function SceneViewport({ snapshot, topology }: SceneViewportProps) {
  const [focus, setFocus] = useState<CameraFocus>("city");
  const selectedEntityId = usePlayerStore((state) => state.selectedEntityId);
  const selectEntity = usePlayerStore((state) => state.selectEntity);

  return (
    <section
      className="scene-viewport"
      aria-label="Interactive architecture city"
    >
      <div className="camera-toolbar" aria-label="Camera focus">
        {focusOptions.map((option) => (
          <button
            key={option.id}
            className={focus === option.id ? "is-active" : ""}
            type="button"
            onClick={() => setFocus(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="scene-stats" aria-live="polite">
        <span>8192 × 128B CELL</span>
        <span>256 MAC</span>
        <span>64 SsbID</span>
        <span>{snapshot ? `CYCLE ${snapshot.cycle}` : "TOPOLOGY PREVIEW"}</span>
      </div>
      <SceneCanvas focus={focus} onBlankClick={() => selectEntity(undefined)}>
        <City
          topology={topology ?? EMPTY_TOPOLOGY}
          snapshot={snapshot}
          selectedEntityId={selectedEntityId}
          onSelect={selectEntity}
        />
      </SceneCanvas>
    </section>
  );
}

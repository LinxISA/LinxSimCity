import { SceneCanvas, type CameraFocus } from "@linxsimcity/scene-core";
import { City } from "@linxsimcity/scene-modules";
import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import type { Vector3 } from "three";

import {
  CAMERA_NUDGE_EVENT,
  type CameraNudge,
} from "../input/use-city-controls.js";
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

export function topologyStats(topology: TopologyDescriptor): {
  readonly cells: number;
  readonly macs: number;
  readonly sharedTileCells: number;
  readonly ssbIds: number;
} {
  return topology.entities.reduce(
    (stats, entity) => ({
      cells: stats.cells + Number(entity.kind === "cell"),
      macs: stats.macs + Number(entity.kind === "cube-mac"),
      sharedTileCells:
        stats.sharedTileCells +
        Number(
          entity.kind === "cell" && entity.parentId === "shared_tile_register",
        ),
      ssbIds: stats.ssbIds + Number(entity.kind === "stgbufb-subspace"),
    }),
    { cells: 0, macs: 0, sharedTileCells: 0, ssbIds: 0 },
  );
}

function CameraKeyboardNudge() {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as
    { target?: Vector3; update?: () => void } | undefined;
  useEffect(() => {
    const listener = (event: Event) => {
      const { x, z } = (event as CustomEvent<CameraNudge>).detail;
      camera.position.x += x;
      camera.position.z += z;
      if (controls?.target) {
        controls.target.x += x;
        controls.target.z += z;
        controls.update?.();
      }
    };
    window.addEventListener(CAMERA_NUDGE_EVENT, listener);
    return () => window.removeEventListener(CAMERA_NUDGE_EVENT, listener);
  }, [camera, controls]);
  return null;
}

export function SceneViewport({ snapshot, topology }: SceneViewportProps) {
  const [focus, setFocus] = useState<CameraFocus>("city");
  const selectedEntityId = usePlayerStore((state) => state.selectedEntityId);
  const selectedPe = usePlayerStore((state) => state.selectedPe);
  const selectEntity = usePlayerStore((state) => state.selectEntity);
  const pinInstruction = usePlayerStore((state) => state.pinInstruction);
  const sceneTopology = topology ?? EMPTY_TOPOLOGY;
  const stats = topologyStats(sceneTopology);

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
        <span>{stats.cells.toLocaleString()} × 128B CELL</span>
        <span>{stats.macs.toLocaleString()} MAC</span>
        <span>
          {stats.sharedTileCells > 0
            ? `${stats.sharedTileCells.toLocaleString()} Shared Tile CELL`
            : `${stats.ssbIds.toLocaleString()} SsbID`}
        </span>
        <span>{snapshot ? `CYCLE ${snapshot.cycle}` : "TOPOLOGY PREVIEW"}</span>
      </div>
      <SceneCanvas focus={focus} onBlankClick={() => selectEntity(undefined)}>
        <CameraKeyboardNudge />
        <City
          topology={sceneTopology}
          snapshot={snapshot}
          selectedEntityId={selectedEntityId}
          selectedPe={selectedPe}
          onSelect={selectEntity}
          onSelectInstruction={pinInstruction}
        />
      </SceneCanvas>
    </section>
  );
}

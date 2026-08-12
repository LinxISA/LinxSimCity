import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import { useMemo } from "react";

import { InstancedBoxes, type BoxInstance } from "../common/InstancedBoxes.js";
import { robAngle, robEntityIds, SPEROB_SLOT_COUNT } from "./scalar-layout.js";

interface RobRingProps {
  readonly center: readonly [number, number];
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function RobRing({
  center,
  snapshot,
  selectedEntityId,
  onSelect,
}: RobRingProps) {
  const instances = useMemo<readonly BoxInstance[]>(() => {
    const radius = 3.55;
    return robEntityIds().map((id, slot) => {
      const angle = robAngle(slot);
      return {
        id,
        position: [
          center[0] + Math.cos(angle) * radius,
          0.55,
          center[1] + Math.sin(angle) * radius,
        ],
        scale: [0.19, 0.8, 0.5],
        rotationY: -angle,
      };
    });
  }, [center]);
  return (
    <group>
      <InstancedBoxes
        instances={instances}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        baseColor={0x7049bd}
        emissive={0x7c55d2}
        onSelect={onSelect}
      />
      <mesh position={[center[0], 0.22, center[1]]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[3.55, 0.11, 8, SPEROB_SLOT_COUNT]} />
        <meshStandardMaterial color="#b28cff" emissive="#7049bd" />
      </mesh>
    </group>
  );
}

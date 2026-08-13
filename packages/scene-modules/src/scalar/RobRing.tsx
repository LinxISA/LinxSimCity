import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useMemo } from "react";

import { InstancedBoxes, type BoxInstance } from "../common/InstancedBoxes.js";
import { entityToBox } from "../topology/placement.js";
import { robAngle, robEntityIds, SPEROB_SLOT_COUNT } from "./scalar-layout.js";

interface RobRingProps {
  readonly topology: TopologyDescriptor;
  readonly selectedPe: number;
  readonly center?: readonly [number, number] | undefined;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

function legacyInstances(
  center: readonly [number, number],
): readonly BoxInstance[] {
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
}

export function RobRing({
  topology,
  selectedPe,
  center = [-65.1, 14.7],
  snapshot,
  selectedEntityId,
  onSelect,
}: RobRingProps) {
  const instances = useMemo<readonly BoxInstance[]>(() => {
    const physical = topology.entities.filter(
      (entity) =>
        entity.kind === "rob-slot" &&
        entity.id.startsWith(`pe${selectedPe}.sperob.slot`) &&
        entity.placement,
    );
    return physical.length > 0
      ? physical.map(entityToBox)
      : legacyInstances(center);
  }, [center, selectedPe, topology]);
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
      {topology.layout ? null : (
        <mesh position={[center[0], 0.22, center[1]]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[3.55, 0.11, 8, SPEROB_SLOT_COUNT]} />
          <meshStandardMaterial color="#b28cff" emissive="#7049bd" />
        </mesh>
      )}
    </group>
  );
}

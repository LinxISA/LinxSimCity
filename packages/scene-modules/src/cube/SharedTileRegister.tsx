import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useMemo } from "react";

import { Building } from "../common/Building.js";
import { InstancedBoxes, type BoxInstance } from "../common/InstancedBoxes.js";
import { entityToBox } from "../topology/placement.js";

interface SharedTileRegisterProps {
  readonly topology: TopologyDescriptor;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

function legacyInstances(): readonly BoxInstance[] {
  const width = 55.5;
  const cellWidth = width / 16;
  return Array.from({ length: 64 }, (_, subspace) => {
    const column = subspace % 16;
    const row = Math.floor(subspace / 16);
    return {
      id: `stgbufb.subspace${subspace}`,
      position: [-4.5 + (column + 0.5) * cellWidth, 0.58, 21.35 + row * 0.88],
      scale: [cellWidth * 0.78, 0.78, 0.62],
    };
  });
}

export function SharedTileRegister({
  topology,
  snapshot,
  selectedEntityId,
  onSelect,
}: SharedTileRegisterProps) {
  const root = topology.entities.find(
    ({ id }) => id === "shared_tile_register" || id === "stgbufb",
  );
  const instances = useMemo<readonly BoxInstance[]>(() => {
    const physical = topology.entities.filter(
      (entity) =>
        entity.placement &&
        (entity.parentId === "shared_tile_register" ||
          entity.kind === "stgbufb-subspace"),
    );
    return physical.length > 0 ? physical.map(entityToBox) : legacyInstances();
  }, [topology]);

  return (
    <group>
      {root?.placement?.position && root.placement.size ? (
        <Building
          id={root.id}
          label="Shared Tile Register · 256KB · 2048 × 128B"
          position={root.placement.position}
          size={root.placement.size}
          color="#270d32"
          emissive="#bb3ee2"
          onSelect={onSelect}
        />
      ) : null}
      <InstancedBoxes
        instances={instances}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        baseColor={0x7d2395}
        emissive={0xd94fff}
        roughness={0.42}
        onSelect={onSelect}
      />
    </group>
  );
}

import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import { useMemo } from "react";

import { Building } from "../common/Building.js";
import { InstancedBoxes, type BoxInstance } from "../common/InstancedBoxes.js";
import { StraightPipe } from "../common/StraightPipe.js";

interface StgBufBProps {
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function StgBufB({
  snapshot,
  selectedEntityId,
  onSelect,
}: StgBufBProps) {
  const instances = useMemo<readonly BoxInstance[]>(() => {
    const startX = -4.5;
    const width = 55.5;
    const cellWidth = width / 16;
    return Array.from({ length: 64 }, (_, subspace) => {
      const column = subspace % 16;
      const row = Math.floor(subspace / 16);
      return {
        id: `stgbufb.subspace${subspace}`,
        position: [
          startX + (column + 0.5) * cellWidth,
          0.58,
          21.35 + row * 0.88,
        ],
        scale: [cellWidth * 0.78, 0.78, 0.62],
      };
    });
  }, []);

  return (
    <group>
      <Building
        id="stgbufb"
        label="StgBufB · Shared Tile Register · 256KB · 64 × 4KB SsbID"
        position={[23.5, 0.18, 22.9]}
        size={[58, 0.22, 4.25]}
        color="#270d32"
        emissive="#bb3ee2"
        onSelect={onSelect}
      />
      <InstancedBoxes
        instances={instances}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        baseColor={0x7d2395}
        emissive={0xd94fff}
        roughness={0.42}
        onSelect={onSelect}
      />
      {Array.from({ length: 16 }, (_, m) => {
        const x = -2.6 + (m + 0.5) * (47.5 / 16);
        return (
          <StraightPipe
            key={m}
            from={[x, 2.05, 22.1]}
            to={[x, 2.05, -28.6]}
            color="#df5cff"
            radius={0.075}
            opacity={0.72}
          />
        );
      })}
    </group>
  );
}

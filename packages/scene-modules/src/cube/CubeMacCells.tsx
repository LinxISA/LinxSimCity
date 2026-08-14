import { resolveLayout } from "@linxsimcity/scene-core";
import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useMemo } from "react";

import { InstancedBoxes, type BoxInstance } from "../common/InstancedBoxes.js";
import { entityToBox } from "../topology/placement.js";
import { cubeEntityId } from "./cube-mapping.js";

interface CubeMacCellsProps {
  readonly topology: TopologyDescriptor;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function CubeMacCells({
  topology,
  snapshot,
  selectedEntityId,
  onSelect,
}: CubeMacCellsProps) {
  const layout = useMemo(
    () => resolveLayout({ schemaVersion: "1.0.0", entities: [] }),
    [],
  );
  const physicalMacs = useMemo(
    () =>
      topology.entities.filter(
        (entity) => entity.kind === "cube-mac" && entity.placement,
      ),
    [topology],
  );
  const instances = useMemo<readonly BoxInstance[]>(() => {
    if (physicalMacs.length > 0) return physicalMacs.map(entityToBox);
    const boxes: BoxInstance[] = [];
    const matrixX = -2.6;
    const matrixWidth = 47.5;
    const cellWidth = matrixWidth / 16;
    for (const row of layout.peRows) {
      const matrixDepth = row.cube.depth - 2.4;
      const cellDepth = matrixDepth / 4;
      for (let m = 0; m < 16; m++) {
        for (let n = 0; n < 4; n++) {
          boxes.push({
            id: cubeEntityId(row.pe, m, n),
            position: [
              matrixX + (m + 0.5) * cellWidth,
              0.75,
              row.cube.z + 1.2 + (n + 0.5) * cellDepth,
            ],
            scale: [cellWidth * 0.83, 1.15, cellDepth * 0.76],
          });
        }
      }
    }
    return boxes;
  }, [layout, physicalMacs]);
  return (
    <InstancedBoxes
      instances={instances}
      snapshot={snapshot}
      selectedEntityId={selectedEntityId}
      baseColor={0x873214}
      emissive={0xff5c22}
      roughness={0.42}
      metalness={0.48}
      onSelect={onSelect}
    />
  );
}

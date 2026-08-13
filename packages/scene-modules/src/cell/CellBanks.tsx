import { resolveLayout } from "@linxsimcity/scene-core";
import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useMemo } from "react";

import { Building } from "../common/Building.js";
import { InstancedBoxes, type BoxInstance } from "../common/InstancedBoxes.js";
import { entityToBox } from "../topology/placement.js";
import {
  BANKS_PER_PE,
  CELLS_PER_BANK,
  CELL_INSTANCE_COUNT,
  PE_COUNT,
  cellEntityId,
} from "./cell-mapping.js";

interface CellBanksProps {
  readonly topology: TopologyDescriptor;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

function legacyInstances(): readonly BoxInstance[] {
  const layout = resolveLayout({ schemaVersion: "1.0.0", entities: [] });
  const boxes: BoxInstance[] = [];
  for (let pe = 0; pe < PE_COUNT; pe++) {
    const row = layout.peRows[pe]!;
    const bankWidth = row.cell.width / BANKS_PER_PE;
    const cellWidth = bankWidth / 32;
    const cellDepth = (row.cell.depth - 1.2) / 8;
    for (let bank = 0; bank < BANKS_PER_PE; bank++) {
      for (let cellRow = 0; cellRow < CELLS_PER_BANK; cellRow++) {
        const column = cellRow % 32;
        const visualRow = Math.floor(cellRow / 32);
        boxes.push({
          id: cellEntityId(pe, bank, cellRow),
          position: [
            row.cell.x + bank * bankWidth + (column + 0.5) * cellWidth,
            0.31,
            row.cell.z + 0.72 + (visualRow + 0.5) * cellDepth,
          ],
          scale: [cellWidth * 0.68, 0.42, cellDepth * 0.68],
        });
      }
    }
  }
  if (boxes.length !== CELL_INSTANCE_COUNT)
    throw new Error("CELL instance count drift");
  return boxes;
}

export function CellBanks({
  topology,
  snapshot,
  selectedEntityId,
  onSelect,
}: CellBanksProps) {
  const physicalCells = useMemo(
    () => topology.entities.filter((entity) => entity.kind === "cell"),
    [topology],
  );
  const instances = useMemo<readonly BoxInstance[]>(
    () =>
      physicalCells.length > 0
        ? physicalCells.map(entityToBox)
        : legacyInstances(),
    [physicalCells],
  );
  const bankEntities = useMemo(
    () =>
      topology.entities.filter(
        (entity) => /^pe\d+\.bg\.bank\d+$/.test(entity.id) && entity.placement,
      ),
    [topology],
  );

  return (
    <group>
      {bankEntities.map((bank) => (
        <Building
          key={bank.id}
          id={bank.id}
          label={bank.label}
          position={bank.placement!.position!}
          size={bank.placement!.size!}
          color="#083b52"
          emissive="#0b80ac"
          onSelect={onSelect}
        />
      ))}
      <InstancedBoxes
        instances={instances}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        baseColor={0x11648a}
        emissive={0x0b8abd}
        roughness={0.5}
        onSelect={onSelect}
      />
    </group>
  );
}

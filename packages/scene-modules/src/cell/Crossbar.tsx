import { resolveLayout } from "@linxsimcity/scene-core";
import { useMemo } from "react";

import { Building } from "../common/Building.js";
import { StraightPipe } from "../common/StraightPipe.js";

interface CrossbarProps {
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function Crossbar({ onSelect }: CrossbarProps) {
  const layout = useMemo(
    () => resolveLayout({ schemaVersion: "1.0.0", entities: [] }),
    [],
  );
  return (
    <group>
      {layout.peRows.map((row) => (
        <group key={row.pe}>
          <Building
            id={`pe${row.pe}.xbar`}
            label="8→4 XBAR"
            position={[-14.45, 0.65, row.cell.z + row.cell.depth / 2]}
            size={[0.75, 1.15, row.cell.depth - 0.8]}
            color="#075477"
            emissive="#23bbf0"
            onSelect={onSelect}
          />
          {Array.from({ length: 4 }, (_, lane) => {
            const z = row.cell.z + 2 + lane * 2.45;
            return (
              <group key={lane}>
                <Building
                  id={`pe${row.pe}.xbar.lane${lane}`}
                  position={[-14.2, 1.13, z]}
                  size={[0.5, 0.42, 0.42]}
                  color="#1c9dcc"
                  onSelect={onSelect}
                />
                <StraightPipe
                  from={[-36.5, 1.08, z]}
                  to={[-13.8, 1.08, z]}
                  color="#29c8ff"
                  radius={0.075}
                />
              </group>
            );
          })}
        </group>
      ))}
    </group>
  );
}

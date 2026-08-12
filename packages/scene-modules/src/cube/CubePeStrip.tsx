import type { PeRowLayout } from "@linxsimcity/scene-core";

import { Building } from "../common/Building.js";

interface CubePeStripProps {
  readonly row: PeRowLayout;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function CubePeStrip({ row, onSelect }: CubePeStripProps) {
  const centerZ = row.cube.z + row.cube.depth / 2;
  return (
    <group>
      <Building
        id={`pe${row.pe}.cube`}
        label={`PE${row.pe} · 16M × 4N × K16`}
        position={[20, 0.2, centerZ]}
        size={[63.2, 0.18, row.cube.depth - 0.35]}
        color="#31140b"
        emissive="#8b2c0e"
        onSelect={onSelect}
      />
      {Array.from({ length: 4 }, (_, slot) => (
        <Building
          key={slot}
          id={`pe${row.pe}.cube.rdbuf.slot${slot}`}
          label={slot === 0 ? "CubeRdBuf" : undefined}
          position={[-10.7 + slot * 1.75, 0.92, centerZ]}
          size={[1.35, 1.5, row.cube.depth - 2.5]}
          color="#4d210f"
          emissive="#e15d24"
          onSelect={onSelect}
        />
      ))}
      <Building
        id={`pe${row.pe}.cube.wq`}
        label="WQ_CUBE"
        position={[48.3, 0.95, centerZ]}
        size={[5.2, 1.55, row.cube.depth - 2.6]}
        color="#54200e"
        emissive="#ff6a2b"
        onSelect={onSelect}
      />
    </group>
  );
}

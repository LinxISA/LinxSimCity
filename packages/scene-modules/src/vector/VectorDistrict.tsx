import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";

import { Building } from "../common/Building.js";
import { DistrictFrame } from "../common/DistrictFrame.js";
import { StraightPipe } from "../common/StraightPipe.js";

interface VectorDistrictProps {
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function VectorDistrict({ onSelect }: VectorDistrictProps) {
  const rows = [-23.1, -10.5, 2.1, 14.7];
  const modules = [
    { label: "VRF", x: -54.9, width: 4.1 },
    { label: "FMLA", x: -50.7, width: 3.6 },
    { label: "ALU", x: -46.8, width: 3.4 },
    { label: "Reduce", x: -42.7, width: 3.7 },
  ];
  return (
    <group>
      <DistrictFrame
        label="VECTOR · 4 SLICES"
        x={-57}
        z={-30}
        width={18}
        depth={54}
        color="#f0c44f"
      />
      {rows.map((z, pe) => (
        <group key={pe}>
          <Building
            id={`pe${pe}.vector`}
            label={`Vector Slice ${pe}`}
            position={[-48, 0.32, z]}
            size={[16.1, 0.34, 10.5]}
            color="#2a260d"
            emissive="#a27f10"
            onSelect={onSelect}
          />
          {modules.map((module, index) => (
            <Building
              key={module.label}
              id={`pe${pe}.vector.${module.label.toLowerCase()}`}
              label={module.label}
              position={[module.x, 1 + index * 0.12, z]}
              size={[module.width, 1.8 + index * 0.22, 6.3]}
              color={["#5c4a0d", "#765e11", "#66500f", "#4b3d0d"][index]!}
              emissive="#d5ad27"
              onSelect={onSelect}
            />
          ))}
          <StraightPipe
            from={[-56.4, 1.35, z]}
            to={[-40.1, 1.35, z]}
            color="#f2c14e"
            radius={0.1}
          />
        </group>
      ))}
    </group>
  );
}

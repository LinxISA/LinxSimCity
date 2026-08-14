import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";

import { Building } from "../common/Building.js";
import { colorForState, stateMap } from "../common/colors.js";
import { DistrictFrame } from "../common/DistrictFrame.js";
import { StraightPipe } from "../common/StraightPipe.js";
import { districtRect, hasPipeviewStageCity } from "../topology/district.js";
import { vectorModuleForStage } from "./vector-stage.js";

interface VectorDistrictProps {
  readonly topology: TopologyDescriptor;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

const modules = [
  { key: "vrf", label: "VRF", x: -54.9, width: 4.1, color: 0x5c4a0d },
  { key: "fmla", label: "FMLA", x: -50.7, width: 3.6, color: 0x765e11 },
  { key: "alu", label: "ALU", x: -46.8, width: 3.4, color: 0x66500f },
  {
    key: "reduce",
    label: "Reduce",
    x: -42.7,
    width: 3.7,
    color: 0x4b3d0d,
  },
] as const;

export function VectorDistrict({
  topology,
  snapshot,
  selectedEntityId,
  onSelect,
}: VectorDistrictProps) {
  const rows = [-23.1, -10.5, 2.1, 14.7];
  const states = stateMap(snapshot);
  const stageCity = hasPipeviewStageCity(topology);
  const district = districtRect(topology, "vector") ?? {
    center: [-48, 0, -3] as const,
    size: [18, 8, 54] as const,
  };
  return (
    <group>
      <DistrictFrame
        label="VECTOR · 4 SLICES"
        center={district.center}
        size={district.size}
        color="#f0c44f"
      />
      {stageCity
        ? null
        : rows.map((z, pe) => {
            const sliceId = `pe${pe}.vector`;
            const sliceState = states.get(sliceId);
            const stageTarget = vectorModuleForStage(sliceState?.stage);
            const sliceActive =
              sliceState !== undefined && sliceState.status !== "idle";
            const sliceColor = colorForState(
              sliceState,
              0x2a260d,
              selectedEntityId === sliceId,
            );
            return (
              <group key={pe}>
                <Building
                  id={sliceId}
                  label={`Vector Slice ${pe}`}
                  position={[-48, 0.32, z]}
                  size={[16.1, 0.34, 10.5]}
                  color={sliceColor}
                  emissive={sliceColor}
                  emissiveIntensity={sliceActive ? 1.05 : 0.1}
                  onSelect={onSelect}
                />
                {modules.map((module, index) => (
                  <Building
                    key={module.label}
                    id={`pe${pe}.vector.${module.key}`}
                    label={module.label}
                    position={[module.x, 1 + index * 0.12, z]}
                    size={[module.width, 1.8 + index * 0.22, 6.3]}
                    color={
                      stageTarget === module.key
                        ? colorForState(sliceState, module.color, false)
                        : module.color
                    }
                    emissive={stageTarget === module.key ? 0x2bd8ff : 0xd5ad27}
                    emissiveIntensity={stageTarget === module.key ? 1.35 : 0.1}
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
            );
          })}
    </group>
  );
}

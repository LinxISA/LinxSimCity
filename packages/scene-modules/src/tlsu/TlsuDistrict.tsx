import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";

import { Building } from "../common/Building.js";
import { DistrictFrame } from "../common/DistrictFrame.js";
import { StraightPipe } from "../common/StraightPipe.js";
import { RoutePipe } from "../topology/RoutePipe.js";

interface TlsuDistrictProps {
  readonly topology: TopologyDescriptor;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

const legacyModules = [
  { id: "tlsu.agu", label: "AGU", x: -62, width: 17 },
  { id: "tlsu.ldq", label: "LDQ", x: -46, width: 13 },
  { id: "tlsu.stq", label: "STQ", x: -32, width: 13 },
  { id: "tlsu.bpq", label: "BridgePairQ", x: -15, width: 18 },
  { id: "tlsu.mte", label: "MTE · GMMA.LD", x: 5, width: 18 },
  { id: "tlsu.response", label: "Response", x: 23, width: 15 },
  { id: "tlsu.l2", label: "L2", x: 38, width: 14 },
] as const;

export function TlsuDistrict({ topology, onSelect }: TlsuDistrictProps) {
  const physicalModules = topology.entities.filter(
    (entity) =>
      entity.kind === "module" &&
      entity.parentId === "tlsu" &&
      entity.placement,
  );
  const physicalPipes = topology.entities.filter(
    (entity) => entity.kind === "pipe" && entity.id.startsWith("tlsu.pipe."),
  );
  return (
    <group>
      <DistrictFrame
        label="TLSU · AGU / LDQ / STQ / BPQ / MTE / RESPONSE"
        x={-104}
        z={45}
        width={198}
        depth={14}
        color="#89d04f"
      />
      {physicalModules.length > 0
        ? physicalModules.map((module) => (
            <Building
              key={module.id}
              id={module.id}
              label={module.label}
              position={module.placement!.position!}
              size={module.placement!.size!}
              color="#285019"
              emissive="#67a83c"
              onSelect={onSelect}
            />
          ))
        : legacyModules.map((module, index) => (
            <Building
              key={module.id}
              id={module.id}
              label={module.label}
              position={[module.x, 1.1 + index * 0.04, 52]}
              size={[module.width, 2, 9.2]}
              color="#285019"
              emissive="#67a83c"
              onSelect={onSelect}
            />
          ))}
      {physicalPipes.length > 0
        ? physicalPipes.map((pipe) => (
            <RoutePipe
              key={pipe.id}
              entity={pipe}
              color="#91df52"
              radius={0.14}
            />
          ))
        : legacyModules.slice(0, -1).map((module, index) => {
            const next = legacyModules[index + 1]!;
            return (
              <StraightPipe
                key={module.id}
                from={[module.x + module.width / 2, 1.4, 52]}
                to={[next.x - next.width / 2, 1.4, 52]}
                color="#91df52"
                radius={0.14}
              />
            );
          })}
    </group>
  );
}

import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type { TopologyEntity } from "@linxsimcity/topology";

import { Building } from "../common/Building.js";
import { threadColor } from "../flow/thread-colors.js";
import { activeStageBays } from "./stage-entities.js";

const DOMAIN_COLORS: Readonly<Record<string, string>> = {
  scalar: "#4a2b79",
  scalarMemory: "#31551e",
  vector: "#66500f",
  cube: "#713018",
  acccvt: "#7f3d20",
  tlsu: "#285019",
  tileBridge: "#366527",
};

function attributeString(entity: TopologyEntity, name: string): string {
  const value = entity.attributes?.[name];
  return typeof value === "string" ? value : "scalar";
}

export function StageBuilding({
  entity,
  events,
  selected,
  onSelect,
}: {
  readonly entity: TopologyEntity;
  readonly events: readonly EventEnvelope[];
  readonly selected: boolean;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}) {
  const position = entity.placement?.position;
  const size = entity.placement?.size;
  if (!position || !size) return null;
  const domain = attributeString(entity, "stageDomain");
  const bays = activeStageBays(events, entity);
  const bayWidth = (size[0] * 0.72) / 4;
  const bayDepth = Math.min(0.72, size[2] * 0.22);
  return (
    <group>
      <Building
        id={entity.id}
        label={entity.label}
        position={position}
        size={size}
        color={selected ? "#ffffff" : (DOMAIN_COLORS[domain] ?? "#34495e")}
        emissive={DOMAIN_COLORS[domain] ?? "#4edcff"}
        emissiveIntensity={bays.some(Boolean) ? 0.72 : 0.08}
        labelScale={0.58}
        onSelect={onSelect}
      />
      {bays.map((active, pe) => (
        <mesh
          key={pe}
          position={[
            position[0] + (pe - 1.5) * bayWidth,
            position[1] + size[1] / 2 + 0.075,
            position[2] - size[2] * 0.24,
          ]}
          userData={{ entityId: entity.id, pe }}
        >
          <boxGeometry args={[bayWidth * 0.74, 0.14, bayDepth]} />
          <meshStandardMaterial
            color={active ? threadColor(pe) : "#13202b"}
            emissive={active ? threadColor(pe) : "#071019"}
            emissiveIntensity={active ? 1.35 : 0.08}
            metalness={0.35}
            roughness={0.46}
          />
        </mesh>
      ))}
    </group>
  );
}

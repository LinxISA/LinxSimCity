import { Building } from "../common/Building.js";
import { DistrictFrame } from "../common/DistrictFrame.js";
import { StraightPipe } from "../common/StraightPipe.js";

interface TlsuDistrictProps {
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function TlsuDistrict({ onSelect }: TlsuDistrictProps) {
  const modules = [
    {
      id: "tlsu.agu",
      label: "TLSU · AGU",
      x: -62,
      width: 17,
      color: "#254a18",
    },
    { id: "tlsu.ldq", label: "LDQ · STQ", x: -43, width: 16, color: "#2d561b" },
    {
      id: "tlsu.mte",
      label: "MTE · GMMA.LD",
      x: -24,
      width: 19,
      color: "#315d1c",
    },
    {
      id: "tlsu.l2",
      label: "L2 · Streaming",
      x: 0,
      width: 23,
      color: "#285019",
    },
    {
      id: "tlsu.sfu",
      label: "SFU · Layout",
      x: 30,
      width: 34,
      color: "#244817",
    },
  ] as const;
  return (
    <group>
      <DistrictFrame
        label="TLSU · MEMORY SUBSYSTEM"
        x={-72}
        z={26}
        width={125}
        depth={14}
        color="#89d04f"
      />
      {modules.map((module, index) => (
        <Building
          key={module.id}
          id={module.id}
          label={module.label}
          position={[module.x, 1.1 + index * 0.08, 33.2]}
          size={[module.width, 2 + index * 0.16, 9.2]}
          color={module.color}
          emissive="#67a83c"
          onSelect={onSelect}
        />
      ))}
      {modules.slice(0, -1).map((module, index) => {
        const next = modules[index + 1]!;
        return (
          <StraightPipe
            key={module.id}
            from={[module.x + module.width / 2, 1.4, 33.2]}
            to={[next.x - next.width / 2, 1.4, 33.2]}
            color="#91df52"
            radius={0.14}
          />
        );
      })}
    </group>
  );
}

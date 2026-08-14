import type { TopologyDescriptor } from "@linxsimcity/topology";

import type { DistrictId, Rect3, ResolvedLayout } from "./types.js";

export const CORE_BOUNDS = { x: -72, z: -30, width: 125, depth: 70 } as const;

export const DISTRICT_BOUNDS = {
  scalar: { x: -72, z: -30, width: 14, depth: 54 },
  vector: { x: -57, z: -30, width: 18, depth: 54 },
  cell: { x: -38, z: -30, width: 24, depth: 54 },
  cube: { x: -13, z: -30, width: 66, depth: 54 },
  stgbufb: { x: -6, z: 20.7, width: 59, depth: 4.6 },
  tlsu: { x: -72, z: 26, width: 125, depth: 14 },
} as const satisfies Record<DistrictId, Rect3>;

const DISTRICT_STYLE: Readonly<
  Record<DistrictId, { readonly label: string; readonly color: string }>
> = {
  scalar: { label: "SCALAR · O3 CPU", color: "#9a70ff" },
  vector: { label: "VECTOR", color: "#f2c14e" },
  cell: { label: "CELL · BG", color: "#34c9f0" },
  cube: { label: "CUBE · GMMA", color: "#ff7138" },
  stgbufb: { label: "Shared Tile Register", color: "#d94fff" },
  tlsu: { label: "TLSU · MEMORY", color: "#87c84a" },
};

const DISTRICT_ORDER = [
  "scalar",
  "vector",
  "cell",
  "cube",
  "stgbufb",
  "tlsu",
] as const satisfies readonly DistrictId[];

export function resolveLayout(topology: TopologyDescriptor): ResolvedLayout {
  const rowGap = 0.8;
  const rowDepth = 11.8;
  const rowStart = -29;
  const peRows = Array.from({ length: 4 }, (_, pe) => {
    const z = rowStart + pe * (rowDepth + rowGap);
    return {
      pe,
      cell: { x: -37, z, width: 22, depth: rowDepth },
      cube: { x: -12, z, width: 64, depth: rowDepth },
    };
  });

  return {
    core: { ...CORE_BOUNDS },
    districts: DISTRICT_ORDER.map((id) => ({
      id,
      ...DISTRICT_BOUNDS[id],
      ...DISTRICT_STYLE[id],
    })),
    peRows,
    topology,
  };
}

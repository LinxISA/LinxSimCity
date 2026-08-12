import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import { useMemo } from "react";

import { InstancedBoxes, type BoxInstance } from "../common/InstancedBoxes.js";
import { cacheEntityIds } from "./scalar-layout.js";

interface CacheCellsProps {
  readonly cache: "l1i" | "l1d";
  readonly origin: readonly [number, number];
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function CacheCells({
  cache,
  origin,
  snapshot,
  selectedEntityId,
  onSelect,
}: CacheCellsProps) {
  const [originX, originZ] = origin;
  const instances = useMemo<readonly BoxInstance[]>(() => {
    const ids = cacheEntityIds(cache);
    return ids.map((id, instanceId) => {
      const column = instanceId % 32;
      const row = Math.floor(instanceId / 32);
      return {
        id,
        position: [originX + column * 0.32, 0.2, originZ + row * 0.135],
        scale: [0.25, 0.28, 0.095],
      };
    });
  }, [cache, originX, originZ]);
  return (
    <InstancedBoxes
      instances={instances}
      snapshot={snapshot}
      selectedEntityId={selectedEntityId}
      baseColor={cache === "l1i" ? 0x5d3e9e : 0x7443b4}
      emissive={0x7d4dca}
      onSelect={onSelect}
    />
  );
}

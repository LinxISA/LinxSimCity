import type { InstanceRegistry } from "./instance-registry.js";

export interface SparseColorTarget {
  colorFor(entityId: string): number;
  write(meshKey: string, instanceId: number, color: number): void;
  flush(meshKey: string): void;
}

export function applySnapshotDelta(
  registry: InstanceRegistry,
  changedEntityIds: readonly string[],
  target: SparseColorTarget,
): { writes: number; meshes: number } {
  const dirtyMeshes = new Set<string>();
  let writes = 0;
  for (const entityId of changedEntityIds) {
    const address = registry.get(entityId);
    if (!address) continue;
    target.write(
      address.meshKey,
      address.instanceId,
      target.colorFor(entityId),
    );
    dirtyMeshes.add(address.meshKey);
    writes++;
  }
  for (const meshKey of dirtyMeshes) target.flush(meshKey);
  return { writes, meshes: dirtyMeshes.size };
}

import type { ArchitectureTopology } from "./types.js";

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(",")}}`;
}

export function topologyFingerprint(topology: ArchitectureTopology): string {
  const normalized = {
    schema: topology.schema,
    schemaVersion: topology.schemaVersion,
    id: topology.id,
    revision: topology.revision,
    nodes: [...topology.nodes]
      .map(({ id, definitionId, parentId, parameters, attributes, area }) => ({
        id,
        definitionId,
        ...(parentId ? { parentId } : {}),
        parameters,
        ...(attributes ? { attributes } : {}),
        area,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...topology.edges]
      .map(({ id, from, to }) => ({ id, from, to }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(stable(normalized))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

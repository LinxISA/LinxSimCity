import type { ArchitectureTopology } from "@linxsimcity/world";

export function createDemoTopology(): ArchitectureTopology {
  return {
    schema: "linxsimcity.topology",
    schemaVersion: "1",
    id: "davincioo.tile-path",
    name: "DavinciOO Tile data path",
    revision: "demo-topology-2026-09-08",
    nodes: [
      {
        id: "spe.issue.queue",
        definitionId: "core.queue",
        label: "Issue Queue",
        parentId: "spe",
        parameters: { capacity: 16, latency: 1 },
      },
      {
        id: "tmu.tile.sram",
        definitionId: "core.sram",
        label: "Tile SRAM",
        parentId: "tmu",
        parameters: { banks: 8, rows: 256 },
      },
      {
        id: "tmu.tile.xbar",
        definitionId: "core.crossbar",
        label: "Tile Crossbar",
        parentId: "tmu",
        parameters: { lanes: 4 },
      },
      {
        id: "vec.engine.0",
        definitionId: "core.vector",
        label: "Vector Engine 0",
        parentId: "vec",
        parameters: { lanes: 8 },
      },
      {
        id: "tmu.writeback.sram",
        definitionId: "core.sram",
        label: "Writeback SRAM",
        parentId: "tmu",
        parameters: { banks: 8, rows: 256 },
      },
      {
        id: "spe",
        definitionId: "core.container",
        label: "SPE district",
        parameters: {},
      },
      {
        id: "tmu",
        definitionId: "core.container",
        label: "TMU district",
        parameters: {},
      },
      {
        id: "vec",
        definitionId: "core.container",
        label: "VEC district",
        parameters: {},
      },
    ],
    edges: [
      {
        id: "flow.issue-vector",
        from: { nodeId: "spe.issue.queue", portId: "out" },
        to: { nodeId: "vec.engine.0", portId: "issue" },
      },
      {
        id: "flow.sram-xbar",
        from: { nodeId: "tmu.tile.sram", portId: "tile-out" },
        to: { nodeId: "tmu.tile.xbar", portId: "in" },
      },
      {
        id: "flow.xbar-vector",
        from: { nodeId: "tmu.tile.xbar", portId: "out" },
        to: { nodeId: "vec.engine.0", portId: "tile" },
      },
      {
        id: "flow.vector-writeback",
        from: { nodeId: "vec.engine.0", portId: "result" },
        to: { nodeId: "tmu.writeback.sram", portId: "tile-in" },
      },
    ],
  };
}

function hasTopologyShape(value: unknown): value is ArchitectureTopology {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ArchitectureTopology>;
  return (
    candidate.schema === "linxsimcity.topology" &&
    candidate.schemaVersion === "1" &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.revision === "string" &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges)
  );
}

export function parseArchitectureTopology(raw: string): ArchitectureTopology {
  const parsed: unknown = JSON.parse(raw);
  if (!hasTopologyShape(parsed)) {
    throw new Error("文件不是当前 LinxSimCity topology 格式。");
  }
  return parsed;
}

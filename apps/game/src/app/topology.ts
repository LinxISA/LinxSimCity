import type { DavinciCatalogMapping } from "@linxsimcity/component-catalog";
import type { ArchitectureTopology } from "@linxsimcity/world";

export const DEFAULT_TOPOLOGY_PATH = "topologies/davincioo-queue-model.json";
export const DEFAULT_CATALOG_PATH = "catalogs/davincioo-h3.json";

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

export function parseDavinciCatalog(raw: string): DavinciCatalogMapping {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("文件不是当前 LinxSimCity DavinciOO catalog 格式。");
  }
  const candidate = parsed as Partial<DavinciCatalogMapping>;
  if (
    candidate.schema !== "linxsimcity.davincioo-catalog" ||
    candidate.schemaVersion !== "1" ||
    candidate.authority !== "catalog-mapping-not-execution-topology" ||
    !Array.isArray(candidate.candidates)
  ) {
    throw new Error("文件不是当前 LinxSimCity DavinciOO catalog 格式。");
  }
  return candidate as DavinciCatalogMapping;
}

export async function loadBundledTopology(
  load: typeof fetch = fetch,
): Promise<ArchitectureTopology> {
  const response = await load(new URL(DEFAULT_TOPOLOGY_PATH, document.baseURI));
  if (!response.ok) {
    throw new Error(`无法加载内置拓扑：HTTP ${response.status}`);
  }
  return parseArchitectureTopology(await response.text());
}

export async function loadBundledCatalog(
  load: typeof fetch = fetch,
): Promise<DavinciCatalogMapping> {
  const response = await load(new URL(DEFAULT_CATALOG_PATH, document.baseURI));
  if (!response.ok) {
    throw new Error(`无法加载 DavinciOO H3 目录：HTTP ${response.status}`);
  }
  return parseDavinciCatalog(await response.text());
}

import { CORE_CATALOG } from "@linxsimcity/component-catalog";
import type { Blueprint } from "@linxsimcity/world";
import { validateBlueprint } from "@linxsimcity/world";

export const BLUEPRINT_STORAGE_KEY = "linxsimcity.blueprint.v1";

function hasBlueprintShape(value: unknown): value is Blueprint {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Blueprint>;
  return (
    candidate.schema === "linxsimcity.blueprint" &&
    candidate.schemaVersion === "1" &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    Number.isSafeInteger(candidate.revision) &&
    Array.isArray(candidate.instances) &&
    Array.isArray(candidate.links)
  );
}

export function parseBlueprint(raw: string): Blueprint {
  const parsed: unknown = JSON.parse(raw);
  if (!hasBlueprintShape(parsed))
    throw new Error("文件不是当前 LinxSimCity blueprint 格式。");
  const diagnostics = validateBlueprint(parsed, CORE_CATALOG);
  if (diagnostics.length > 0) {
    throw new Error(`蓝图校验失败：${diagnostics[0]!.message}`);
  }
  return parsed;
}

export function loadSavedBlueprint(
  storage: Pick<Storage, "getItem">,
): Blueprint | undefined {
  const saved = storage.getItem(BLUEPRINT_STORAGE_KEY);
  if (!saved) return undefined;
  return parseBlueprint(saved);
}

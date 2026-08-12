import { validateBundle, type ValidationReport } from "./validate.js";

export interface InspectionResult {
  schema: string | undefined;
  profile: string | undefined;
  firstCycle: number | undefined;
  lastCycle: number | undefined;
  cycles: number;
  events: number;
  chunks: number;
  valid: boolean;
  errors: ValidationReport["errors"];
  warnings: ValidationReport["warnings"];
}

export async function inspectBundle(path: string): Promise<InspectionResult> {
  const report = await validateBundle(path);
  return {
    schema: report.stats.schemaVersion,
    profile: report.stats.profile,
    firstCycle: report.stats.firstCycle,
    lastCycle: report.stats.lastCycle,
    cycles: report.stats.cycles,
    events: report.stats.events,
    chunks: report.stats.chunks,
    valid: report.valid,
    errors: report.errors,
    warnings: report.warnings,
  };
}

export function formatInspection(inspection: InspectionResult): string {
  return [
    `Schema: ${inspection.schema ?? "unknown"}`,
    `Profile: ${inspection.profile ?? "unknown"}`,
    `Cycles: ${inspection.firstCycle ?? "unknown"}-${inspection.lastCycle ?? "unknown"} (${inspection.cycles})`,
    `Events: ${inspection.events}`,
    `Chunks: ${inspection.chunks}`,
    `Valid: ${inspection.valid ? "yes" : "no"}`,
  ].join("\n");
}

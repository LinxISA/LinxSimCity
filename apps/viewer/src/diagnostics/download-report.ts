import type { WorkerDiagnostic } from "@linxsimcity/trace-runtime";

interface ReportMetadata {
  readonly schemaVersion?: string | undefined;
  readonly modelVersion?: string | undefined;
}

function safePath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const normalized = path.replaceAll("\\", "/");
  if (!normalized.startsWith("/") && !/^[A-Za-z]:\//u.test(normalized)) {
    return normalized;
  }
  const parts = normalized.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

export function createValidationReport(
  diagnostic: WorkerDiagnostic,
  metadata: ReportMetadata = {},
): string {
  const path = safePath(diagnostic.path);
  return `${JSON.stringify(
    {
      format: "linxsimcity-validation-report/v1",
      schemaVersion: metadata.schemaVersion ?? null,
      modelVersion: metadata.modelVersion ?? null,
      diagnostic: {
        code: diagnostic.code,
        message: diagnostic.message,
        fatal: diagnostic.fatal,
        path: path ?? null,
        details: diagnostic.details ?? null,
      },
    },
    null,
    2,
  )}\n`;
}

export function downloadValidationReport(
  diagnostic: WorkerDiagnostic,
  metadata: ReportMetadata,
): void {
  const blob = new Blob([createValidationReport(diagnostic, metadata)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "linxsimcity-validation-report.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

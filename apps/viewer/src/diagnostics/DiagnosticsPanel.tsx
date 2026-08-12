import type { WorkerDiagnostic } from "@linxsimcity/trace-runtime";

import { diagnosticTitle } from "./diagnostic-copy.js";
import { downloadValidationReport } from "./download-report.js";

interface DiagnosticsPanelProps {
  readonly diagnostic: WorkerDiagnostic;
  readonly schemaVersion?: string | undefined;
  readonly modelVersion?: string | undefined;
  readonly onRetry: () => void;
}

export function DiagnosticsPanel({
  diagnostic,
  schemaVersion,
  modelVersion,
  onRetry,
}: DiagnosticsPanelProps) {
  return (
    <section
      className="diagnostics-panel"
      role={diagnostic.fatal ? "alert" : "status"}
    >
      <span className="diagnostic-code">{diagnostic.code}</span>
      <h2>{diagnosticTitle(diagnostic.code)}</h2>
      <p>{diagnostic.message}</p>
      <dl>
        <div>
          <dt>Schema</dt>
          <dd>{schemaVersion ?? "unavailable"}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{modelVersion ?? "unavailable"}</dd>
        </div>
        {diagnostic.path ? (
          <div>
            <dt>Entry</dt>
            <dd>{diagnostic.path}</dd>
          </div>
        ) : null}
      </dl>
      <div className="diagnostic-actions">
        <button className="primary-button" type="button" onClick={onRetry}>
          Retry
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            downloadValidationReport(diagnostic, {
              schemaVersion,
              modelVersion,
            })
          }
        >
          Download report
        </button>
      </div>
    </section>
  );
}

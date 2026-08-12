// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { createValidationReport } from "./download-report.js";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";

afterEach(cleanup);

const diagnostic = {
  code: "checksum_mismatch",
  message: "chunk checksum does not match",
  fatal: true,
  path: "/Users/alice/traces/chunks/000000.jsonl.gz",
} as const;

test("renders structured fatal diagnostics and retry", async () => {
  const retry = vi.fn();
  render(
    <DiagnosticsPanel
      diagnostic={diagnostic}
      schemaVersion="1.0.0"
      modelVersion="abc123"
      onRetry={retry}
    />,
  );
  expect(screen.getByRole("alert").textContent).toContain("checksum_mismatch");
  expect(screen.getByRole("alert").textContent).toContain("abc123");
  await userEvent.click(screen.getByRole("button", { name: /retry/i }));
  expect(retry).toHaveBeenCalledOnce();
});

test("validation reports are deterministic and redact absolute paths", () => {
  const first = createValidationReport(diagnostic, {
    schemaVersion: "1.0.0",
    modelVersion: "abc123",
  });
  const second = createValidationReport(diagnostic, {
    schemaVersion: "1.0.0",
    modelVersion: "abc123",
  });
  expect(first).toBe(second);
  expect(first).not.toContain("/Users/alice");
  expect(first).toContain("chunks/000000.jsonl.gz");
});

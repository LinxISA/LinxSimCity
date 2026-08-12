import { TraceBundleError } from "../bundle/types.js";
import { SeekError } from "../reducer/seek.js";
import type { WorkerDiagnostic } from "./protocol.js";

export class SeekSupersededError extends Error {
  readonly code = "seek_superseded";

  constructor(
    readonly requestId: number,
    readonly latestRequestId: number,
  ) {
    super(
      `seek request ${requestId} was superseded by request ${latestRequestId}`,
    );
    this.name = "SeekSupersededError";
  }
}

export class TraceClientError extends Error {
  constructor(readonly diagnostic: WorkerDiagnostic) {
    super(diagnostic.message);
    this.name = "TraceClientError";
  }
}

export function normalizeWorkerError(error: unknown): WorkerDiagnostic {
  if (error instanceof TraceBundleError) {
    return { code: error.code, message: error.message, fatal: true };
  }
  if (error instanceof SeekError) {
    return { code: error.code, message: error.message, fatal: false };
  }
  if (error instanceof SeekSupersededError) {
    return {
      code: error.code,
      message: error.message,
      fatal: false,
      details: {
        requestId: error.requestId,
        latestRequestId: error.latestRequestId,
      },
    };
  }
  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown; path?: unknown };
    return {
      code:
        typeof candidate.code === "string" ? candidate.code : "runtime_error",
      message: error.message,
      fatal: true,
      ...(typeof candidate.path === "string" ? { path: candidate.path } : {}),
    };
  }
  return {
    code: "runtime_error",
    message: String(error),
    fatal: true,
  };
}

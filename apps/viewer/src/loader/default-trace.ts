import type { WorkerTraceSource } from "@linxsimcity/trace-runtime";

export const DEFAULT_TRACE_DIRECTORY = "supernpubench-fa-250-blocks";

export interface DefaultTraceController {
  start(): Promise<boolean>;
  cancel(): void;
  retry(): Promise<boolean>;
}

interface DefaultTraceControllerOptions {
  readonly baseUrl: string;
  readonly pageUrl?: string | undefined;
  readonly loadTrace: (source: WorkerTraceSource) => Promise<boolean>;
  readonly play: () => void;
  readonly onFailure: (error?: unknown) => void;
}

export function resolveDefaultTraceUrl(baseUrl: string): string {
  const root = baseUrl.length === 0 ? "/" : baseUrl;
  const normalized = root.endsWith("/") ? root : `${root}/`;
  return `${normalized}traces/${DEFAULT_TRACE_DIRECTORY}/`;
}

function absoluteBundleUrl(baseUrl: string, pageUrl?: string): string {
  const fallback = "http://localhost/";
  const candidate = pageUrl ?? globalThis.location?.href ?? fallback;
  const documentUrl = /^https?:/.test(candidate) ? candidate : fallback;
  return new URL(resolveDefaultTraceUrl(baseUrl), documentUrl).href;
}

export function createDefaultTraceController({
  baseUrl,
  pageUrl,
  loadTrace,
  play,
  onFailure,
}: DefaultTraceControllerOptions): DefaultTraceController {
  let generation = 0;
  let currentAttempt: Promise<boolean> | undefined;

  const run = async (attemptGeneration: number): Promise<boolean> => {
    try {
      const loaded = await loadTrace({
        kind: "http-directory",
        baseUrl: absoluteBundleUrl(baseUrl, pageUrl),
      });
      if (attemptGeneration !== generation) return false;
      if (!loaded) {
        onFailure(
          new Error("Default trace worker could not load the logical bundle"),
        );
        return false;
      }
      play();
      return true;
    } catch (error) {
      if (attemptGeneration !== generation) return false;
      onFailure(error);
      return false;
    }
  };

  const start = (): Promise<boolean> => {
    currentAttempt ??= run(generation);
    return currentAttempt;
  };

  const reset = () => {
    generation += 1;
    currentAttempt = undefined;
  };

  return {
    start,
    cancel: reset,
    retry() {
      reset();
      return start();
    },
  };
}

export const DEFAULT_TRACE_FILENAME = "supernpubench-fa-250-blocks.linxtrace";

export interface DefaultTraceController {
  start(): Promise<boolean>;
  cancel(): void;
  retry(): Promise<boolean>;
}

interface DefaultTraceControllerOptions {
  readonly baseUrl: string;
  readonly fetchTrace?: typeof fetch;
  readonly loadTrace: (file: File) => Promise<boolean>;
  readonly play: () => void;
  readonly onFailure: (error?: unknown) => void;
}

export function resolveDefaultTraceUrl(baseUrl: string): string {
  const root = baseUrl.length === 0 ? "/" : baseUrl;
  const normalized = root.endsWith("/") ? root : `${root}/`;
  return `${normalized}traces/${DEFAULT_TRACE_FILENAME}`;
}

export function createDefaultTraceController({
  baseUrl,
  fetchTrace = fetch,
  loadTrace,
  play,
  onFailure,
}: DefaultTraceControllerOptions): DefaultTraceController {
  let generation = 0;
  let currentAttempt: Promise<boolean> | undefined;

  const run = async (attemptGeneration: number): Promise<boolean> => {
    try {
      const response = await fetchTrace(resolveDefaultTraceUrl(baseUrl));
      if (attemptGeneration !== generation) return false;
      if (!response.ok) {
        throw new Error(
          `Default trace request failed with HTTP ${response.status}`,
        );
      }

      const blob = await response.blob();
      if (attemptGeneration !== generation) return false;
      const loaded = await loadTrace(
        new File([blob], DEFAULT_TRACE_FILENAME, {
          type: response.headers.get("content-type") ?? "application/zip",
        }),
      );
      if (attemptGeneration !== generation) return false;
      if (!loaded) {
        onFailure();
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

import {
  normalizeWorkerError,
  type WorkerDiagnostic,
} from "@linxsimcity/trace-runtime";
import { useCallback, useEffect, useRef, useState } from "react";

import { usePlayerStore } from "../player/player-store.js";
import {
  createDefaultTraceController,
  type DefaultTraceController,
} from "./default-trace.js";

export function useTraceLoader() {
  const loadTrace = usePlayerStore((state) => state.loadTrace);
  const play = usePlayerStore((state) => state.play);
  const unload = usePlayerStore((state) => state.unload);
  const status = usePlayerStore((state) => state.status);
  const diagnostic = usePlayerStore((state) => state.diagnostic);
  const [defaultFailure, setDefaultFailure] = useState(false);
  const [defaultDiagnostic, setDefaultDiagnostic] =
    useState<WorkerDiagnostic>();
  const controller = useRef<DefaultTraceController>(undefined);
  const lifecycleGeneration = useRef(0);

  controller.current ??= createDefaultTraceController({
    baseUrl: import.meta.env.BASE_URL,
    loadTrace,
    play,
    onFailure(error) {
      setDefaultFailure(true);
      if (error !== undefined) {
        setDefaultDiagnostic(normalizeWorkerError(error));
      }
    },
  });

  useEffect(() => {
    const mountedGeneration = ++lifecycleGeneration.current;
    return () => {
      queueMicrotask(() => {
        if (lifecycleGeneration.current === mountedGeneration) {
          controller.current?.cancel();
        }
      });
    };
  }, []);

  const startDefaultTrace = useCallback(() => controller.current!.start(), []);
  const loadFile = useCallback(
    (file: File) => {
      controller.current!.cancel();
      setDefaultFailure(false);
      setDefaultDiagnostic(undefined);
      return loadTrace(file);
    },
    [loadTrace],
  );
  const retryLoad = useCallback(async () => {
    const shouldRetry = defaultFailure || diagnostic !== undefined;
    await unload();
    if (!shouldRetry) return;
    setDefaultFailure(false);
    setDefaultDiagnostic(undefined);
    await controller.current!.retry();
  }, [defaultFailure, diagnostic, unload]);

  return {
    loadFile,
    startDefaultTrace,
    retryLoad,
    status,
    diagnostic: diagnostic ?? defaultDiagnostic,
  } as const;
}

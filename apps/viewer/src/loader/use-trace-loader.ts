import { useCallback } from "react";

import { usePlayerStore } from "../player/player-store.js";

export function useTraceLoader() {
  const loadTrace = usePlayerStore((state) => state.loadTrace);
  const status = usePlayerStore((state) => state.status);
  const diagnostic = usePlayerStore((state) => state.diagnostic);
  const loadFile = useCallback((file: File) => loadTrace(file), [loadTrace]);
  return { loadFile, status, diagnostic } as const;
}

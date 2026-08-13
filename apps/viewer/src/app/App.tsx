import { useEffect, useMemo } from "react";

import { DiagnosticsPanel } from "../diagnostics/DiagnosticsPanel.js";
import { CommitHud } from "../hud/CommitHud.js";
import { useCityControls } from "../input/use-city-controls.js";
import { TraceDropzone } from "../loader/TraceDropzone.js";
import { useTraceLoader } from "../loader/use-trace-loader.js";
import { playerStore, usePlayerStore } from "../player/player-store.js";
import { startPlaybackClock } from "../player/playback-clock.js";
import { SceneViewport } from "../scene/SceneViewport.js";
import { Timeline } from "../timeline/Timeline.js";
import "./styles.css";

export function App() {
  const status = usePlayerStore((state) => state.status);
  const info = usePlayerStore((state) => state.info);
  const snapshot = usePlayerStore((state) => state.snapshot);
  const cycle = usePlayerStore((state) => state.cycle);
  const rate = usePlayerStore((state) => state.rate);
  const seekPending = usePlayerStore((state) => state.seekPending);
  const selectedPe = usePlayerStore((state) => state.selectedPe);
  const followCommit = usePlayerStore((state) => state.followCommit);
  const pinnedInstructionId = usePlayerStore(
    (state) => state.pinnedInstructionId,
  );
  const liveCommit = usePlayerStore((state) => state.liveCommit);
  const recentCommits = usePlayerStore((state) => state.recentCommits);
  const seek = usePlayerStore((state) => state.seek);
  const play = usePlayerStore((state) => state.play);
  const pause = usePlayerStore((state) => state.pause);
  const step = usePlayerStore((state) => state.step);
  const setRate = usePlayerStore((state) => state.setRate);
  const selectPe = usePlayerStore((state) => state.selectPe);
  const setFollowCommit = usePlayerStore((state) => state.setFollowCommit);
  const pinInstruction = usePlayerStore((state) => state.pinInstruction);
  const { loadFile, startDefaultTrace, retryLoad, diagnostic } =
    useTraceLoader();

  useEffect(() => startPlaybackClock(playerStore), []);
  useEffect(() => {
    void startDefaultTrace();
  }, [startDefaultTrace]);

  const cityControls = useMemo(
    () => ({
      playing: status === "playing",
      followCommit,
      play,
      pause,
      step: (delta: number) => void step(delta),
      selectPe,
      setFollowCommit,
      clearPinnedInstruction: () => pinInstruction(undefined),
    }),
    [
      followCommit,
      pause,
      pinInstruction,
      play,
      selectPe,
      setFollowCommit,
      status,
      step,
    ],
  );
  useCityControls(cityControls);

  return (
    <main className="app-shell">
      <TraceDropzone
        compact={Boolean(snapshot)}
        onLoad={loadFile}
        status={status}
      />
      {diagnostic ? (
        <DiagnosticsPanel
          diagnostic={diagnostic}
          schemaVersion={info?.manifest.schemaVersion}
          modelVersion={info?.manifest.modelVersion}
          onRetry={() => void retryLoad()}
        />
      ) : null}
      <SceneViewport snapshot={snapshot} topology={info?.topology} />
      <div className={`status-overlay status-${status}`} aria-live="polite">
        LINXSIMCITY · {status.toUpperCase()} · PE{selectedPe} · CYCLE {cycle}
      </div>
      <div className="pe-selector" aria-label="Selected PE">
        {[0, 1, 2, 3].map((pe) => (
          <button
            key={pe}
            type="button"
            className={selectedPe === pe ? "is-active" : ""}
            onClick={() => selectPe(pe as 0 | 1 | 2 | 3)}
          >
            PE{pe}
          </button>
        ))}
      </div>
      <CommitHud
        snapshot={snapshot}
        liveCommit={liveCommit}
        pinnedInstructionId={pinnedInstructionId}
        recentCommits={recentCommits}
      />
      <div className="control-hint">
        DRAG orbit · WHEEL zoom · ARROWS move · SHIFT+←/→ cycle · SPACE play ·
        1–4 PE · F follow · ESC unpin
      </div>
      <Timeline
        cycle={cycle}
        firstCycle={info?.manifest.firstCycle ?? 0}
        lastCycle={info?.manifest.lastCycle ?? 0}
        status={status}
        rate={rate}
        seekPending={seekPending}
        onSeek={(target) => void seek(target)}
        onPlay={play}
        onPause={pause}
        onStep={(delta) => void step(delta)}
        onRate={setRate}
      />
    </main>
  );
}

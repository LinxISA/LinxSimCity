import { useEffect } from "react";

import { DiagnosticsPanel } from "../diagnostics/DiagnosticsPanel.js";
import { TraceDropzone } from "../loader/TraceDropzone.js";
import { useTraceLoader } from "../loader/use-trace-loader.js";
import { Inspector } from "../inspector/Inspector.js";
import { playerStore, usePlayerStore } from "../player/player-store.js";
import { startPlaybackClock } from "../player/playback-clock.js";
import { Timeline } from "../timeline/Timeline.js";
import { SceneViewport } from "../scene/SceneViewport.js";
import "./styles.css";

export function App() {
  const status = usePlayerStore((state) => state.status);
  const info = usePlayerStore((state) => state.info);
  const snapshot = usePlayerStore((state) => state.snapshot);
  const unload = usePlayerStore((state) => state.unload);
  const cycle = usePlayerStore((state) => state.cycle);
  const rate = usePlayerStore((state) => state.rate);
  const mode = usePlayerStore((state) => state.mode);
  const seekPending = usePlayerStore((state) => state.seekPending);
  const selectedEntityId = usePlayerStore((state) => state.selectedEntityId);
  const seek = usePlayerStore((state) => state.seek);
  const play = usePlayerStore((state) => state.play);
  const pause = usePlayerStore((state) => state.pause);
  const step = usePlayerStore((state) => state.step);
  const setRate = usePlayerStore((state) => state.setRate);
  const setMode = usePlayerStore((state) => state.setMode);
  const { loadFile, diagnostic } = useTraceLoader();

  useEffect(() => startPlaybackClock(playerStore), []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="product-kicker">LINX ISA · TRACE EXPLORER</span>
          <h1>LinxSimCity</h1>
        </div>
        <div className={`status-chip status-${status}`}>
          <span /> {status.toUpperCase()}
        </div>
      </header>
      <section className="workspace">
        <div className="scene-column">
          {!snapshot ? (
            <TraceDropzone onLoad={loadFile} status={status} />
          ) : null}
          {diagnostic ? (
            <DiagnosticsPanel
              diagnostic={diagnostic}
              schemaVersion={info?.manifest.schemaVersion}
              modelVersion={info?.manifest.modelVersion}
              onRetry={() => void unload()}
            />
          ) : null}
          <SceneViewport snapshot={snapshot} topology={info?.topology} />
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
        </div>
        <aside className="inspector-shell" aria-label="Inspector">
          <div className="mode-toggle" aria-label="Inspector mode">
            <button
              className={mode === "demo" ? "is-active" : ""}
              type="button"
              onClick={() => setMode("demo")}
            >
              Demo
            </button>
            <button
              className={mode === "expert" ? "is-active" : ""}
              type="button"
              onClick={() => setMode("expert")}
            >
              Expert
            </button>
          </div>
          <Inspector
            mode={mode}
            selectedEntityId={selectedEntityId}
            snapshot={snapshot}
            topology={info?.topology}
          />
        </aside>
      </section>
    </main>
  );
}

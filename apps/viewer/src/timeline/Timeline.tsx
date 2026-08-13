import { useEffect, useRef, useState } from "react";

import type { PlaybackRate, PlayerStatus } from "../player/types.js";
import { CycleInput } from "./CycleInput.js";
import { PlaybackControls } from "./PlaybackControls.js";

export interface TimelineProps {
  readonly cycle: number;
  readonly firstCycle: number;
  readonly lastCycle: number;
  readonly status: PlayerStatus;
  readonly rate: PlaybackRate;
  readonly seekPending: boolean;
  readonly onSeek: (cycle: number) => void;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onStep: (delta: number) => void;
  readonly onRate: (rate: PlaybackRate) => void;
}

export function Timeline(props: TimelineProps) {
  const [scrubCycle, setScrubCycle] = useState(props.cycle);
  const pendingCycle = useRef(props.cycle);
  const frame = useRef<number | undefined>(undefined);
  const disabled = !["ready", "playing"].includes(props.status);

  useEffect(() => setScrubCycle(props.cycle), [props.cycle]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.matches("input, select, textarea, [contenteditable=true]")
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (props.status === "playing") props.onPause();
        else props.onPlay();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        props.onStep(-1);
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        props.onStep(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props]);

  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const scrub = (nextCycle: number) => {
    setScrubCycle(nextCycle);
    pendingCycle.current = nextCycle;
    if (frame.current !== undefined) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      props.onSeek(pendingCycle.current);
    });
  };

  const span = Math.max(1, props.lastCycle - props.firstCycle);
  const progress = ((props.cycle - props.firstCycle) / span) * 100;

  return (
    <section className="timeline-shell" aria-label="Trace navigation">
      <div className="timeline-track-wrap">
        <div className="timeline-progress" style={{ width: `${progress}%` }} />
        <input
          aria-label="Trace timeline"
          disabled={disabled}
          min={props.firstCycle}
          max={props.lastCycle}
          type="range"
          value={scrubCycle}
          onChange={(event) => scrub(Number(event.currentTarget.value))}
        />
      </div>
      <div className="timeline-toolbar">
        <PlaybackControls
          status={props.status}
          rate={props.rate}
          disabled={disabled}
          busy={props.seekPending}
          onPlay={props.onPlay}
          onPause={props.onPause}
          onStep={props.onStep}
          onRate={props.onRate}
        />
        <CycleInput
          cycle={props.cycle}
          firstCycle={props.firstCycle}
          lastCycle={props.lastCycle}
          disabled={disabled}
          onCommit={props.onSeek}
        />
      </div>
    </section>
  );
}

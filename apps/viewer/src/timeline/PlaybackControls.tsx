import type { PlaybackRate, PlayerStatus } from "../player/types.js";

interface PlaybackControlsProps {
  readonly status: PlayerStatus;
  readonly rate: PlaybackRate;
  readonly disabled?: boolean;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onStep: (delta: number) => void;
  readonly onRate: (rate: PlaybackRate) => void;
}

const rates = [0.25, 0.5, 1, 2, 4] as const;

export function PlaybackControls({
  status,
  rate,
  disabled = false,
  onPlay,
  onPause,
  onStep,
  onRate,
}: PlaybackControlsProps) {
  return (
    <div className="playback-controls">
      <button
        disabled={disabled}
        type="button"
        onClick={() => onStep(-1)}
        aria-label="Previous cycle"
      >
        ‹
      </button>
      <button
        className="play-button"
        disabled={disabled}
        type="button"
        onClick={status === "playing" ? onPause : onPlay}
        aria-label={status === "playing" ? "Pause" : "Play"}
      >
        {status === "playing" ? "Ⅱ" : "▶"}
      </button>
      <button
        disabled={disabled}
        type="button"
        onClick={() => onStep(1)}
        aria-label="Next cycle"
      >
        ›
      </button>
      <label className="rate-control">
        <span>Playback rate</span>
        <select
          aria-label="Playback rate"
          disabled={disabled}
          value={rate}
          onChange={(event) =>
            onRate(Number(event.currentTarget.value) as PlaybackRate)
          }
        >
          {rates.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

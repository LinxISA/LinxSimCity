import { useEffect, useState } from "react";

interface CycleInputProps {
  readonly cycle: number;
  readonly firstCycle: number;
  readonly lastCycle: number;
  readonly disabled?: boolean;
  readonly onCommit: (cycle: number) => void;
}

export function CycleInput({
  cycle,
  firstCycle,
  lastCycle,
  disabled = false,
  onCommit,
}: CycleInputProps) {
  const [value, setValue] = useState(String(cycle));
  useEffect(() => setValue(String(cycle)), [cycle]);

  const commit = () => {
    const parsed = Number(value);
    const target = Number.isFinite(parsed)
      ? Math.max(firstCycle, Math.min(lastCycle, Math.trunc(parsed)))
      : cycle;
    setValue(String(target));
    onCommit(target);
  };

  return (
    <label className="cycle-input">
      <span>Cycle number</span>
      <input
        aria-label="Cycle number"
        disabled={disabled}
        inputMode="numeric"
        value={value}
        onBlur={commit}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
      <small>/ {lastCycle.toLocaleString()}</small>
    </label>
  );
}

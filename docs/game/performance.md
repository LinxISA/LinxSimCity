# Large-scene performance gate

Issue #1 M8 uses one deterministic performance fixture and a Chrome DevTools
Protocol harness. The fixture contains 240 actual leaf topology nodes plus one
district container. These are rendered instances generated from topology; the
DavinciOO catalog's 240 candidates are not counted as scene instances. One
hundred Queue modules and one hundred Table modules expose 20,000 logical
entries, checkpoints contain 1,000 simultaneously active Queue tokens, and the
current trace contains exactly 1,000,000 events in 100 independently seekable
chunks.

Build the game and run the release gate from the repository root:

```sh
npm run build --workspace @linxsimcity/game
node scripts/perf/harness.mjs \
  --duration 60 \
  --output build/perf/m8-report.json
```

The harness generates `build/perf/m8-large.bundle`, serves the production game
and substitutes that bundle for the recorded run, launches Chrome headlessly,
and fails explicitly when the production page or Chrome executable is absent.
Set `CHROME_BIN` or pass `--chrome-bin` when Chrome is installed outside the
known platform paths. The viewport is fixed to 1440×900 at DPR 1.

The measured path loads the million-event bundle, records every animation-frame
interval while applying one deterministic orbit drag and alternating zoom step
per second for 60 seconds, then performs 100 deterministic warm seeks through
the visible Cycle control. The JSON report includes the machine, Chrome build,
fixture hash and scale manifest, raw frame/seek/long-task samples, JavaScript
heap and CDP renderer counters, and summarized p50/p95 values.

Both hard gates must pass:

- frame-duration p95 ≤ 25 ms
- warm-seek p95 ≤ 500 ms

The command writes the complete report before exiting nonzero on a failed gate.
A shorter run is useful only as wiring smoke evidence and does not qualify the
release gate:

```sh
node scripts/perf/harness.mjs --duration 5 \
  --output build/perf/m8-smoke-report.json
```

Run the optional 30-minute soak after the fixed 60-second path with:

```sh
node scripts/perf/harness.mjs --duration 60 --soak-minutes 30 \
  --output build/perf/m8-soak-report.json
```

Use `--no-generate --fixture <directory>` to measure a previously generated
fixture without rewriting it. `node scripts/perf/generate-fixture.mjs <path>`
generates the bundle independently.

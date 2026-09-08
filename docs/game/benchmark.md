# Reproducible benchmark baseline

## Fixed reference environment

| Item               | Fixed value                           |
| ------------------ | ------------------------------------- |
| Machine            | MacBook Pro `Mac17,2`                 |
| SoC                | Apple M5, 10 CPU cores / 10 GPU cores |
| Memory             | 32 GB                                 |
| OS                 | macOS 26.6.2 (`25G83`)                |
| Browser            | Google Chrome 152.0.7977.76           |
| Viewport           | 1440 × 900 CSS pixels                 |
| Device pixel ratio | 1                                     |

Runs use AC power, 100% browser zoom, one visible game tab, the production
build, and a fresh browser process. Record the camera path, quality settings,
trace, random-seek seed, and raw results.

## Pinned first real workload

- Model checkout: `/Users/zhoubot/Documents/.worktrees/SuperScalarModel-linxsimcity-trace`
- Model revision: `18e73d63114d9ad3a8b440c65c115d68381dfaf3`
- Workload: SuperNPUBench FP32 matmul, `M=N=K=256`, tile `32×32×32`
- ELF: `/Users/zhoubot/Documents/supernpubench-smoke-20260807/kernel/matmul/elf/kernel_matmul/matmul_MASK_MASK_FP32_M256_N256_K256_tM32_tN32_tK32.elf`
- ELF SHA-256: `4c3a93ec7394b3a159dcdaab4457a95c4f0be1b49d77bae8661b67e24ca93928`

Existing model output and old `linxtrace` artifacts are provenance and
source-observation evidence only. They are not an accepted game run. M5 must
rerun this exact ELF at the pinned revision through the current producer and
emit one current `linxsimcity.trace` bundle with topology, config, and workload
hashes.

## Dry-run and validation

This read-only preflight is executable now:

```sh
MODEL=/Users/zhoubot/Documents/.worktrees/SuperScalarModel-linxsimcity-trace
ELF=/Users/zhoubot/Documents/supernpubench-smoke-20260807/kernel/matmul/elf/kernel_matmul/matmul_MASK_MASK_FP32_M256_N256_K256_tM32_tN32_tK32.elf
test "$(git -C "$MODEL" rev-parse HEAD)" = 18e73d63114d9ad3a8b440c65c115d68381dfaf3
test "$(shasum -a 256 "$ELF" | awk '{print $1}')" = 4c3a93ec7394b3a159dcdaab4457a95c4f0be1b49d77bae8661b67e24ca93928
test -x "$MODEL/bin/gfsim"
```

The model accepts the pinned ELF with:

```sh
MODEL=/Users/zhoubot/Documents/.worktrees/SuperScalarModel-linxsimcity-trace
ELF=/Users/zhoubot/Documents/supernpubench-smoke-20260807/kernel/matmul/elf/kernel_matmul/matmul_MASK_MASK_FP32_M256_N256_K256_tM32_tN32_tK32.elf
"$MODEL/bin/gfsim" -f "$ELF"
```

### Verified minimum run evidence

On 2026-09-09, the pinned `gfsim` executable ran the pinned ELF above and
exited with status 0. Its stdout contained `FIFO_IN`, `BC_ALLOC`, `ISSUE`, and
`DONE` observations, followed by Tile register utilization and BROB/BISQ stall
statistics and the final `SuperScalar Report Stop` marker. This proves that the
fixed workload completes in the selected model and that the model can expose
the minimum queue/allocation/issue/completion chain plus storage and retirement
statistics.

That stdout is source evidence, not a current-format trace bundle. It does not
prove that Queue and Tile identities satisfy `linxsimcity.trace`, that events
can be deterministically replayed, or that any legacy bundle passes the current
validator. M1/M5 still require the current writer and the missing producer
instrumentation before this run can become an accepted game fixture.

After M5 adds the current producer, its output must pass the current-format
validator and must not be routed through legacy `linxtrace`:

```sh
npm run trace:verify -- <current-run.json> <matching-topology.json>
```

## Fixed M8 load

M8 measures the production build at the fixed viewport and DPR using one
deterministically generated scene containing at least 240 renderable instances,
20,000 visible/logical Queue/Table/SRAM slots, 1,000 simultaneously active
tokens, and 1,000,000 current-format trace events. The 240 instances are a
rendering load and do not claim all 240 H3 catalog candidates are runnable.

The warmed 60-second camera path is: overview fit (10 s), rank-axis orbit
(15 s), Queue focus (10 s), ROB/Table close-up (10 s), Cube/Vector/TMA sweep
(10 s), and overview return (5 s). Use deterministic seek seed `0x4c53434d30`
for 100 warm seeks. Record frame-time p50/p95, seek p50/p95, long tasks, process
memory, renderer object/texture counts, and raw browser trace. The gates remain
p95 frame time ≤25 ms, p95 warm seek ≤500 ms, and 30 minutes without crash or
unbounded residency growth.

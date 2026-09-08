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
- Model revision: `b975e75b1fc3c9453b55bc0f036ae757a8b0a981`
- Workload: SuperNPUBench FP32 matmul, `M=N=K=256`, tile `32×32×32`
- ELF: `/Users/zhoubot/Documents/supernpubench-smoke-20260807/kernel/matmul/elf/kernel_matmul/matmul_MASK_MASK_FP32_M256_N256_K256_tM32_tN32_tK32.elf`
- ELF SHA-256: `4c3a93ec7394b3a159dcdaab4457a95c4f0be1b49d77bae8661b67e24ca93928`

The accepted M5 normal run is stored at
`apps/game/public/runs/superscalar-matmul.bundle`. Old `linxtrace` artifacts
remain provenance evidence only and are not accepted game runs.

## Dry-run and validation

This read-only preflight is executable now:

```sh
MODEL=/Users/zhoubot/Documents/.worktrees/SuperScalarModel-linxsimcity-trace
ELF=/Users/zhoubot/Documents/supernpubench-smoke-20260807/kernel/matmul/elf/kernel_matmul/matmul_MASK_MASK_FP32_M256_N256_K256_tM32_tN32_tK32.elf
test "$(git -C "$MODEL" rev-parse HEAD)" = b975e75b1fc3c9453b55bc0f036ae757a8b0a981
test "$(shasum -a 256 "$ELF" | awk '{print $1}')" = 4c3a93ec7394b3a159dcdaab4457a95c4f0be1b49d77bae8661b67e24ca93928
test -x "$MODEL/bin/gfsim"
```

The model accepts the pinned ELF with:

```sh
MODEL=/Users/zhoubot/Documents/.worktrees/SuperScalarModel-linxsimcity-trace
ELF=/Users/zhoubot/Documents/supernpubench-smoke-20260807/kernel/matmul/elf/kernel_matmul/matmul_MASK_MASK_FP32_M256_N256_K256_tM32_tN32_tK32.elf
"$MODEL/bin/gfsim" -f "$ELF"
```

### Verified current run evidence

On 2026-09-09, trace-enabled `gfsim` at the pinned revision ran the pinned ELF
and exited with status 0. The run closed at cycle 49,822 and emitted 313,318
current events in 13 gzip chunks with zero dropped events and no truncation.
The current TypeScript validator reported zero diagnostics.

| Current event          |  Count |
| ---------------------- | -----: |
| Queue attempts/accept  |  1,024 |
| Queue visible/read     |  1,024 |
| Queue backpressure     | 10,725 |
| Tile allocate          | 49,152 |
| Tile read              | 60,576 |
| Tile write             | 49,152 |
| Tile release           | 45,760 |
| Token/Tile association | 92,832 |
| Compute start/complete |    512 |

The runtime-off control also exited 0 with the same 49,822 total cycles,
40,303 Cube cycles, and 10,497 TMA cycles. After removing trace configuration
echoes and wall-clock throughput fields, functional logs were identical. The
producer currently writes only the trustworthy cycle-0 checkpoint; periodic
checkpoints remain disabled until the producer can serialize a complete reducer
state.

Validate the pinned bundle with:

```sh
npm run trace:verify -- apps/game/public/runs/superscalar-matmul.bundle
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

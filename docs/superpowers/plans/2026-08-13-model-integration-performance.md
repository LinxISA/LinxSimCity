# LinxSimCity SuperScalarModel Integration and Performance Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect SuperScalarModel to the LinxSimCity contract, produce real overview/pipeline/forensic traces, render SuperNPUBench matmul and Flash Attention workloads, and close correctness and performance gates.

**Architecture:** A model-local `LinxTraceAdapter` owns the SDK sink, cycle boundaries, stable entity IDs, and profile filtering. Narrow hook calls are inserted at existing state-transition functions in SPEROB, DFX pipeline output, L1, CellReg, VectorLite, CubeCore, and TileLsu. Integration tests run real ELFs, validate bundles with the LinxSimCity CLI, and exercise the viewer against those outputs.

**Tech Stack:** SuperScalarModel C++17/CMake, LinxSimCity Trace SDK v1, gfsim, SuperNPUBench workloads, Node.js CLI, Playwright.

## Global Constraints

- Plans 1–3 must pass first.
- SuperScalarModel behavior and architectural results must be unchanged when tracing is disabled or enabled.
- Tracing is compile-time optional and runtime disabled by default.
- `NullTraceSink` overhead must be negligible; hook sites do not serialize JSON themselves.
- Topology uses current configured capacities, not hard-coded viewer assumptions.
- Profiles are `overview`, `pipeline`, and `forensic`; profile filtering occurs before event allocation/serialization.
- Real workload acceptance requires both model PASS and trace/viewer PASS.
- Internal visual placement may be tuned from real traces, but fixed district boundaries and A/B flow directions remain unchanged.

---

## File Structure

```text
SuperScalarModel/
├── CMakeLists.txt
├── configs/Trace.toml
├── TimingSim/CMakeLists.txt
├── TimingSim/trace/linx/linx_trace_adapter.{h,cpp}
├── TimingSim/trace/linx/topology_builder.{h,cpp}
├── TimingSim/trace/linx/entity_ids.h
├── TimingSim/trace/linx/profile_filter.{h,cpp}
├── TimingSim/infra/SimSys.{cpp,h}
├── TimingSim/scalar_pe/spe/SPEROB.cpp
├── TimingSim/debug/DFX/PipeViewOut.cpp
├── TimingSim/scalar_pe/lsu/l1/{L1DCache.cpp,cluster.cpp}
├── TimingSim/pe/cell/CellReg.cpp
├── TimingSim/pe/vector/Vector.cpp
├── TimingSim/pe/cube/CubeCore.cpp
└── TimingSim/group/tlsu/tile_lsu.cpp

LinxSimCity/
├── fixtures/real/{matmul,flash-attention}/
├── tools/supernpubench/
├── tests/integration/
├── tests/performance/
└── docs/integration/
```

### Task 1: Optional SDK Link and Trace Configuration

**Files:**
- Modify: `SuperScalarModel/CMakeLists.txt`
- Modify: `SuperScalarModel/TimingSim/CMakeLists.txt`
- Modify: `SuperScalarModel/configs/Trace.toml`
- Create: `SuperScalarModel/TimingSim/trace/linx/profile_filter.h`
- Create: `SuperScalarModel/TimingSim/trace/linx/profile_filter.cpp`
- Test: `SuperScalarModel/tests/linx_trace/profile_filter_test.cpp`

**Interfaces:**
- Produces CMake option `ENABLE_LINXSIMCITY_TRACE` default `OFF`.
- Produces cache path `LINXSIMCITY_SDK_DIR` and links `LinxSimCity::trace_sdk` only when enabled.
- Produces runtime config fields `linx_enable`, `linx_profile`, `linx_output`, `linx_chunk_cycles`, `linx_checkpoint_cycles`.

- [ ] **Step 1: Write failing profile/config tests**

Assert overview rejects cell-level events, pipeline accepts cell/cache/ROB, forensic accepts arbitration payloads, and invalid profile fails at startup with a clear error.

- [ ] **Step 2: Run test to verify failure**

Run: `cmake -S SuperScalarModel -B SuperScalarModel/build-trace -DBUILD_TESTS=ON -DENABLE_LINXSIMCITY_TRACE=ON -DLINXSIMCITY_SDK_DIR="$PWD/LinxSimCity/sdk/cpp" && cmake --build SuperScalarModel/build-trace --target profile_filter_test`

Expected: FAIL because option and test target do not exist.

- [ ] **Step 3: Add optional CMake integration**

When enabled, call `add_subdirectory(${LINXSIMCITY_SDK_DIR} ${CMAKE_BINARY_DIR}/linxsimcity-sdk)` and link `model_lib` privately. Define `LINXSIMCITY_TRACE_ENABLED=1`. Disabled builds compile without SDK headers.

- [ ] **Step 4: Add runtime configuration**

Extend `[Trace]` with:

```toml
linx_enable = false
linx_profile = "pipeline"
linx_output = "linx-trace"
linx_chunk_cycles = 4096
linx_checkpoint_cycles = 4096
```

- [ ] **Step 5: Build enabled and disabled configurations**

```bash
cmake -S SuperScalarModel -B SuperScalarModel/build-default -DBUILD_TESTS=ON
cmake --build SuperScalarModel/build-default --parallel
cmake -S SuperScalarModel -B SuperScalarModel/build-trace -DBUILD_TESTS=ON -DENABLE_LINXSIMCITY_TRACE=ON -DLINXSIMCITY_SDK_DIR="$PWD/LinxSimCity/sdk/cpp"
cmake --build SuperScalarModel/build-trace --parallel
ctest --test-dir SuperScalarModel/build-trace -R profile_filter --output-on-failure
```

Expected: both builds PASS.

- [ ] **Step 6: Commit in SuperScalarModel**

```bash
git -C SuperScalarModel add CMakeLists.txt TimingSim/CMakeLists.txt configs/Trace.toml TimingSim/trace/linx tests/linx_trace
git -C SuperScalarModel commit -m "feat: add optional LinxSimCity trace configuration"
```

### Task 2: Topology Builder and Cycle-Level Adapter

**Files:**
- Create: `SuperScalarModel/TimingSim/trace/linx/entity_ids.h`
- Create: `SuperScalarModel/TimingSim/trace/linx/topology_builder.h`
- Create: `SuperScalarModel/TimingSim/trace/linx/topology_builder.cpp`
- Create: `SuperScalarModel/TimingSim/trace/linx/linx_trace_adapter.h`
- Create: `SuperScalarModel/TimingSim/trace/linx/linx_trace_adapter.cpp`
- Modify: `SuperScalarModel/TimingSim/common/include/SimSys.h`
- Modify: `SuperScalarModel/TimingSim/infra/SimSys.cpp`
- Test: `SuperScalarModel/tests/linx_trace/topology_builder_test.cpp`

**Interfaces:**
- Produces: `LinxTraceAdapter::BeginCycle`, `Emit`, `EndCycle`, `Close`, `Enabled`, `Profile`.
- Produces stable helpers `CellEntityId(pe,bank,row)`, `CacheEntityId(level,set,way)`, `RobEntityId(pe,slot)`, `CubeMacEntityId(pe,m,n)`.
- `SimSys::step()` calls BeginCycle before module Work and EndCycle after module Xfer.

- [ ] **Step 1: Write failing topology tests**

Build topology from default configs and assert 8192 CELL, 1024 L1I, 1024 L1D, 128 SPEROB, 256 CUBE MAC, 64 StgBufB, four PE quarters, and valid parent/port references.

- [ ] **Step 2: Run test to verify failure**

Run: `cmake --build SuperScalarModel/build-trace --target topology_builder_test && ctest --test-dir SuperScalarModel/build-trace -R topology_builder --output-on-failure`

Expected: FAIL because builder does not exist.

- [ ] **Step 3: Implement config-driven topology**

Read `cell.toml`, `ifu.toml`, `l1.toml`, and `spe.toml` through existing config objects. Generate placement hints `{district, order, row, column}` and ports, not Three.js coordinates.

- [ ] **Step 4: Implement adapter lifecycle in SimSys**

Construct the adapter after Core/config build, call Begin/End around every normal cycle, and call Close on simulation completion and error unwinding. `Emit` is an inline no-op when disabled.

- [ ] **Step 5: Run topology and model smoke tests**

Run: `ctest --test-dir SuperScalarModel/build-trace -R 'topology_builder|smoke' --output-on-failure`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C SuperScalarModel add TimingSim/trace/linx TimingSim/common/include/SimSys.h TimingSim/infra/SimSys.cpp tests/linx_trace
git -C SuperScalarModel commit -m "feat: emit model topology and trace cycle boundaries"
```

### Task 3: Scalar Pipeline, ROB, and Cache Hooks

**Files:**
- Modify: `SuperScalarModel/TimingSim/debug/DFX/PipeViewOut.cpp`
- Modify: `SuperScalarModel/TimingSim/scalar_pe/spe/SPEROB.cpp`
- Modify: `SuperScalarModel/TimingSim/scalar_pe/lsu/l1/L1DCache.cpp`
- Modify: `SuperScalarModel/TimingSim/scalar_pe/lsu/l1/cluster.cpp`
- Modify: `SuperScalarModel/TimingSim/frontend/bctrl/bfu/bfu_bhc.cpp`
- Modify: `SuperScalarModel/TimingSim/frontend/bctrl/bfu/bfu_bhc.h`
- Test: `SuperScalarModel/tests/linx_trace/scalar_trace_test.cpp`

**Interfaces:**
- Emits instruction stage, ROB allocate/complete/retire/flush, register-ready, cache access/hit/miss/fill/writeback events.

- [ ] **Step 1: Write failing scalar trace test**

Run a short scalar ELF and assert stage order per instruction, ROB slot lifecycle, cache set/way bounds, and strictly ordered event envelope.

- [ ] **Step 2: Run test to verify failure**

Run: `ctest --test-dir SuperScalarModel/build-trace -R scalar_trace --output-on-failure`

Expected: FAIL because hooks do not emit events.

- [ ] **Step 3: Add stage and ROB hooks at existing transitions**

Reuse DFX stage names rather than inventing a parallel stage model. Emit allocation in `SPEROB::allocROB`, completion in `SPEROB::CompleteROB`, retire in `SPEROB::commit`, and squash range in `SPEROB::flush`.

- [ ] **Step 4: Add cache hooks with resolved set/way**

Emit after lookup result and after refill/replacement selection. Include physical address only in forensic profile.

- [ ] **Step 5: Run scalar tests and compare architectural results**

Run the same ELF with tracing disabled and enabled; compare exit status, cycles, committed instruction count, and result memory checksum.

- [ ] **Step 6: Commit**

```bash
git -C SuperScalarModel add TimingSim/debug/DFX TimingSim/scalar_pe/spe TimingSim/scalar_pe/lsu tests/linx_trace
git -C SuperScalarModel commit -m "feat: trace scalar pipeline ROB and caches"
```

### Task 4: CELL, Crossbar, Vector, CUBE, StgBufB, and TLSU Hooks

**Files:**
- Modify: `SuperScalarModel/TimingSim/pe/cell/CellReg.cpp`
- Modify: `SuperScalarModel/TimingSim/pe/vector/Vector.cpp`
- Modify: `SuperScalarModel/TimingSim/pe/cube/CubeCore.cpp`
- Modify: `SuperScalarModel/TimingSim/group/tlsu/tile_lsu.cpp`
- Modify: `SuperScalarModel/TimingSim/group/b_staging_sram.*`
- Test: `SuperScalarModel/tests/linx_trace/dsa_trace_test.cpp`

**Interfaces:**
- Emits `cell.read/write/grant/conflict`, `crossbar.request/grant`, vector/CUBE dispatch/stage/complete/writeback, StgBufB access, memory request/response, and pipe transfer events.

- [ ] **Step 1: Write failing DSA trace test**

Use `tests/prebuilt-elf/cube/tmatmul_fp16_64x64x64.elf`. Assert one four-bank A group, horizontal lane IDs, vertical B broadcasts, CUBE stage order, WQ_CUBE writeback, and valid CELL ranges.

- [ ] **Step 2: Run test to verify failure**

Run: `ctest --test-dir SuperScalarModel/build-trace -R dsa_trace --output-on-failure`

Expected: FAIL because DSA hooks are absent.

- [ ] **Step 3: Hook CellReg arbitration at authoritative functions**

Emit request at `DispatchRequests`, conflict/winner at `Arbitrate`, and actual read/write at `ServeBank`. Derive row and byte range from request portions; do not infer them in viewer.

- [ ] **Step 4: Hook engine lifecycle transitions**

Emit Vector events in `ReceivedCmd`, `ResolveUop`, `ResolveTile`, `WriteTileReg`; CUBE events in `ROBWork` and existing pipeline logging points; TLSU events at request acceptance and response completion; StgBufB events at slot allocation/read/recycle.

- [ ] **Step 5: Run test and result equivalence**

Compare tmatmul result checksum, model cycles, and committed block counts with tracing off/on. Validate trace using `linxtrace validate`.

- [ ] **Step 6: Commit**

```bash
git -C SuperScalarModel add TimingSim/pe/cell TimingSim/pe/vector TimingSim/pe/cube TimingSim/group tests/linx_trace
git -C SuperScalarModel commit -m "feat: trace CELL vector CUBE and TLSU dataflow"
```

### Task 5: SuperNPUBench Runner and Real Fixtures

**Files:**
- Create: `LinxSimCity/tools/supernpubench/run-case.ts`
- Create: `LinxSimCity/tools/supernpubench/cases.ts`
- Create: `LinxSimCity/tools/supernpubench/collect-trace.ts`
- Create: `LinxSimCity/tests/integration/supernpubench-matmul.test.ts`
- Create: `LinxSimCity/tests/integration/supernpubench-fa.test.ts`
- Create: `LinxSimCity/fixtures/real/matmul/manifest.expected.json`
- Create: `LinxSimCity/fixtures/real/flash-attention/manifest.expected.json`

**Interfaces:**
- Produces command `npm run supernpubench -- --case matmul|flash-attention --profile pipeline`.
- Accepts benchmark source through `SUPERNPUBENCH_DIR`; resolves canonical matmul and FA case paths once and records source commit in manifest.

- [ ] **Step 1: Acquire and pin SuperNPUBench**

If no local checkout exists, clone the official repository into `/Users/zhoubot/Documents/SuperNPUBench`, record `git rev-parse HEAD`, and add that commit to `docs/integration/supernpubench.md`. Do not vendor benchmark sources into LinxSimCity.

- [ ] **Step 2: Write failing integration tests**

Matmul test requires model PASS, non-empty CUBE/CELL events, valid bundle, and viewer seek to a CUBE-active cycle. FA test additionally requires at least two matmul phases plus Vector/SFU/TLSU activity.

- [ ] **Step 3: Run tests to capture failures**

Run:

```bash
npx vitest run tests/integration/supernpubench-matmul.test.ts
npx vitest run tests/integration/supernpubench-fa.test.ts
```

Expected: FAIL until runner and case mapping are implemented.

- [ ] **Step 4: Implement build/run/collect pipeline**

The runner builds or locates each ELF, invokes trace-enabled gfsim with a temporary output directory, validates it, packs it, and writes only the compact `.linxtrace` plus expected manifest summary under `fixtures/real`.

- [ ] **Step 5: Run both benchmark cases**

```bash
npm run supernpubench -- --case matmul --profile pipeline
npm run supernpubench -- --case flash-attention --profile pipeline
npx vitest run tests/integration/supernpubench-matmul.test.ts tests/integration/supernpubench-fa.test.ts
```

Expected: both model runs PASS and both integration tests PASS.

- [ ] **Step 6: Commit in LinxSimCity**

```bash
git -C LinxSimCity add tools/supernpubench tests/integration fixtures/real docs/integration
git -C LinxSimCity commit -m "test: add SuperNPUBench matmul and FA trace fixtures"
```

### Task 6: Real-Trace Visual Tuning and Showcase

**Files:**
- Create: `LinxSimCity/apps/viewer/src/showcase/showcases.ts`
- Create: `LinxSimCity/apps/viewer/src/showcase/ShowcasePicker.tsx`
- Modify: scene module layout constants only where real traces expose overlaps
- Create: `LinxSimCity/tests/visual/real-matmul.spec.ts`
- Create: `LinxSimCity/tests/visual/real-fa.spec.ts`
- Create: `LinxSimCity/docs/showcase/matmul.md`
- Create: `LinxSimCity/docs/showcase/flash-attention.md`

**Interfaces:**
- Produces two built-in showcase entries with named focus cycles and camera presets.

- [ ] **Step 1: Write failing real-trace visual tests**

Matmul screenshot must show four-bank A reads, vertical B broadcast, active MAC cells, and C writeback. FA screenshot sequence must show load→QK matmul→vector/SFU→PV matmul→store phases.

- [ ] **Step 2: Run to capture failures**

Run: `npx playwright test tests/visual/real-matmul.spec.ts tests/visual/real-fa.spec.ts`

Expected: FAIL until showcases and focus cycles exist.

- [ ] **Step 3: Add showcase metadata and tune permitted placement**

Store `{ traceUrl, title, description, focusCycles[] }`. Adjust only module offsets, heights, labels, camera targets, pipe anchors, and LOD. Preserve fixed macro placement and A/B directions.

- [ ] **Step 4: Run visual tests at 736px and 360px**

Expected: PASS with zero overflow and zero console errors.

- [ ] **Step 5: Commit**

```bash
git -C LinxSimCity add apps/viewer/src/showcase packages/scene-* tests/visual docs/showcase
git -C LinxSimCity commit -m "feat: add matmul and Flash Attention showcases"
```

### Task 7: Performance, Documentation, and Final Release Gates

**Files:**
- Create: `LinxSimCity/tests/performance/model-trace-overhead.test.ts`
- Create: `LinxSimCity/tests/performance/real-trace-viewer.test.ts`
- Create: `LinxSimCity/docs/integration/superscalar-model.md`
- Create: `LinxSimCity/docs/integration/profiles.md`
- Modify: both repositories' README and CI workflows

**Interfaces:**
- Produces final report with disabled overhead, profile trace sizes, seek P50/P95, peak heap, and scene FPS for matmul and FA.

- [ ] **Step 1: Add failing performance gates**

Measure tracing disabled versus compile-time-off model, overview/pipeline/forensic sizes, random seek, and scene FPS. Disabled tracing overhead gate is ≤1%; pipeline trace random seek P95 is ≤250ms; warmed scene target is 60 FPS.

- [ ] **Step 2: Run complete validation matrix**

```bash
npm -C LinxSimCity run check
npm -C LinxSimCity run build -w @linxsimcity/viewer
npx --prefix LinxSimCity playwright test
ctest --test-dir SuperScalarModel/build-default --output-on-failure
ctest --test-dir SuperScalarModel/build-trace --output-on-failure
npx --prefix LinxSimCity vitest run tests/integration tests/performance
```

Expected: all PASS.

- [ ] **Step 3: Fix regressions without weakening gates**

Optimize profile filtering, chunk/checkpoint spans, sparse updates, worker caches, and internal placement. Do not drop required events, reduce physical instance counts, or raise acceptance thresholds.

- [ ] **Step 4: Re-run the complete matrix and inspect both showcases**

Expected: all commands PASS; matmul and FA model outputs are correct and viewer console is clean.

- [ ] **Step 5: Commit, push, and tag**

```bash
git -C SuperScalarModel push origin HEAD
git -C LinxSimCity add tests/performance docs README.md .github/workflows
git -C LinxSimCity commit -m "docs: finalize model integration and performance gates"
git -C LinxSimCity tag v0.1.0
git -C LinxSimCity push origin main v0.1.0
```

## Plan 4 Completion Gate

- Trace-disabled and trace-enabled SuperScalarModel results match.
- Matmul and Flash Attention benchmark cases both pass in the model.
- Both real traces validate, pack, load, seek, and render.
- Real-trace visual tests prove the requested pipeline effects.
- Full CI, performance gates, and release tag `v0.1.0` pass.

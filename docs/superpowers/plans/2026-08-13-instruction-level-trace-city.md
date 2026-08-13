# LinxSimCity Instruction-Level Trace City Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit and render a physically placed, instruction-level SuperScalarModel trace with real ROB, PRF, shared cache-line, Tile CELL, CUBE, and TLSU causality, then publish it as the default chunked FlashAttention demo.

**Architecture:** SuperScalarModel owns authoritative event generation and physical topology; LinxSimCity validates the contract, reconstructs causal state from checkpoints and on-demand chunks, and renders topology-provided placements and routes. The Viewer uses a full-screen WebGL canvas with borderless commit HUD, stable thread-colored tokens, selected-PE scalar detail, and global shared-cache/Tile/CUBE/TLSU activity.

**Tech Stack:** C++17, SuperScalarModel TimingSim, LinxSimCity C++ trace SDK, TypeScript 5.9, Zod, React 19, Zustand, Three.js/React Three Fiber, Vitest, Vite, GitHub Pages.

## Global Constraints

- Work only in `/Users/zhoubot/Documents/LinxSimCity/.worktrees/implementation` and `/Users/zhoubot/Documents/.worktrees/SuperScalarModel-linxsimcity-trace`; do not modify either repository's `main` worktree.
- Preserve the untracked SuperScalarModel build directories; never delete or reset user/previous-agent artifacts.
- Use TDD for every behavior change: observe RED, implement the smallest contract, observe GREEN, then commit.
- Run memory-heavy gates sequentially with one worker or bounded parallelism; never run full model and full TypeScript suites concurrently.
- The Viewer never infers ROB slots, physical registers, cache ways, CELL rows, issue ports, or routes when detailed trace fields are required.
- Four PE-threads share one I-Cache topology and one D-Cache topology; every access retains `thread_id`.
- Tile Register geometry is exactly `4 PE × 8 banks × 256 rows × 128 bytes = 8192 CELL`.
- Physical city placement and pipe routes live in `topology.json`; all pipe route segments are orthogonal.
- Instruction body color is stable by thread; hit/miss/stall/flush/read/write are overlay effects.
- Existing `.linxtrace` ZIP archives and legacy topologies remain loadable through explicit fallback behavior.
- Public trace delivery is a remote logical bundle with metadata-first and on-demand checkpoint/chunk fetches.
- Local and CI verification must include typecheck, tests, lint, formatting, build, C++ CTest, trace validation, Pages artifact validation, and final browser acceptance.

---

## File Structure

### LinxSimCity

```text
packages/topology/src/
  types.ts                 physical placement, ports, routes, layout space
  validate.ts              finite bounds and orthogonal-route validation
packages/trace-schema/src/
  detailed-payloads.ts     required instruction/cache/CELL/TLSU payloads
  schemas.ts               discriminated event validation and capabilities
packages/trace-runtime/src/
  bundle/http-entry-store.ts remote logical bundle reader
  causal/types.ts          instruction and request causal graph
  causal/reduce-causal.ts  causal-state event reducer
  reducer/state.ts         snapshot embeds causal state
packages/scene-modules/src/
  topology/                topology placement/route adapters
  scalar/                  selected-PE ROB/PRF/IQ/pipes/shared caches
  cell/                    exact 8192 CELL and arbitration visualization
  tlsu/                    detailed TLSU stages and queues
  flow/                    continuous route-driven tokens
apps/viewer/src/
  app/                     full-screen shell
  hud/                     borderless live commit and pinned trace
  input/                   keyboard/mouse control contract
  player/                  selected PE, follow, pin, remote source state
scripts/
  verify-pages-build.mjs   logical-bundle production verification
```

### SuperScalarModel trace worktree

```text
TimingSim/trace/linx/
  detailed_event_payload.{h,cpp}
  physical_layout.{h,cpp}
  topology_builder.{h,cpp}
  linx_trace_adapter.{h,cpp}
TimingSim/frontend/rob/SPEROB.cpp
TimingSim/trace/InstTracer.cpp
TimingSim/scalar_pe/lsu/l1/
TimingSim/pe/cell/CellReg.cpp
TimingSim/pe/cube/CubeCore.cpp
TimingSim/group/tlsu/tile_lsu.cpp
tests/linx_trace/
```

---

### Task 1: Physical Topology and Detailed Trace Contracts

**Repository:** LinxSimCity

**Files:**
- Modify: `packages/topology/src/types.ts`
- Modify: `packages/topology/src/validate.ts`
- Modify: `packages/topology/src/validate.test.ts`
- Modify: `sdk/cpp/include/linxsimcity/trace/topology.h`
- Modify: `sdk/cpp/include/linxsimcity/trace/bundle_writer.h`
- Modify: `sdk/cpp/src/bundle_writer.cpp`
- Modify: `sdk/cpp/tests/bundle_writer_test.cpp`
- Create: `packages/trace-schema/src/detailed-payloads.ts`
- Modify: `packages/trace-schema/src/types.ts`
- Modify: `packages/trace-schema/src/schemas.ts`
- Modify: `packages/trace-schema/src/schemas.test.ts`
- Modify: `packages/trace-schema/src/index.ts`
- Regenerate: `packages/trace-schema/schema/linxtrace-v1.schema.json`

**Interfaces:**
- Produces `TopologyLayout`, `TopologyVector3`, `TopologyRoute`, expanded `TopologyPlacement`, and port positions.
- Produces `DetailedInstructionPayload`, `DetailedRegisterPayload`, `DetailedCachePayload`, `DetailedCellPayload`, `DetailedMemoryPayload`, and `DetailedPipePayload`.
- Produces manifest capability strings `instruction-causality-v1`, `physical-layout-v1`, `shared-cache-v1`, `cell-128b-v1`, and `tlsu-detail-v1`.
- Produces matching C++ topology/layout/route structures and `WriterOptions.capabilities`, so SuperScalarModel serializes the same JSON contract without an intermediate rewrite.

- [ ] **Step 1: Write failing topology validation tests**

Add TypeScript and C++ cases that accept finite `position/size/rotation`, port positions, and an orthogonal route, then reject zero/negative size, non-finite coordinates, unknown route endpoints, and a diagonal segment. The C++ bundle test must serialize layout, port positions, routes, and manifest capabilities with the exact TypeScript field names:

```ts
expect(
  validateTopology({
    schemaVersion: "1.1.0",
    layout: {
      schema: "linx-city-v1",
      units: "scene-unit",
      upAxis: "y",
      forwardAxis: "-z",
      districts: [
        {
          id: "scalar",
          position: [-62, 1, 0],
          size: [12, 4, 8],
        },
      ],
    },
    entities: [
      {
        id: "pe0.issue",
        kind: "module",
        label: "Issue",
        instance: { index: 0 },
        placement: {
          district: "scalar",
          position: [-66, 1, 0],
          size: [4, 2, 3],
          rotation: [0, 0, 0],
        },
        ports: [
          {
            id: "pe0.issue.out1",
            direction: "out",
            position: [-64, 1, 0],
          },
        ],
      },
      {
        id: "pe0.int0",
        kind: "module",
        label: "INT0",
        instance: { index: 0 },
        placement: {
          district: "scalar",
          position: [-60, 1, 0],
          size: [4, 2, 3],
          rotation: [0, 0, 0],
        },
        ports: [
          {
            id: "pe0.int0.in",
            direction: "in",
            position: [-62, 1, 0],
          },
        ],
      },
      {
        id: "pipe.scalar.int0",
        kind: "pipe",
        label: "Issue to INT0",
        instance: { index: 0 },
        route: {
          style: "orthogonal",
          fromPortId: "pe0.issue.out1",
          toPortId: "pe0.int0.in",
          points: [[-64, 1, -2], [-62, 1, -2], [-62, 1, 0]],
        },
      },
    ],
  }).errors,
).toEqual([]);
```

- [ ] **Step 2: Run topology tests and confirm RED**

Run:

```sh
npx vitest run packages/topology/src/validate.test.ts
cmake --build build/sdk --target bundle_writer_test --parallel 2
ctest --test-dir build/sdk -R bundle_writer --output-on-failure
```

Expected: FAIL because layout, coordinates, port positions, and routes are not defined or validated.

- [ ] **Step 3: Implement physical topology types and validation**

Use fixed tuples and optional legacy fields:

```ts
export type TopologyVector3 = readonly [number, number, number];

export interface TopologyDistrict {
  id: string;
  position: TopologyVector3;
  size: TopologyVector3;
}

export interface TopologyLayout {
  schema: "linx-city-v1";
  units: "scene-unit";
  upAxis: "y";
  forwardAxis: "-z";
  districts: readonly TopologyDistrict[];
}

export interface TopologyRoute {
  style: "orthogonal";
  fromPortId: string;
  toPortId: string;
  points: readonly TopologyVector3[];
}

export interface TopologyPlacement {
  district: string;
  thread?: number;
  position?: TopologyVector3;
  size?: TopologyVector3;
  rotation?: TopologyVector3;
  row?: number;
  column?: number;
  lodGroup?: string;
  order?: number;
}
```

Collect globally unique district and port IDs, validate placement districts and route references in later passes, reject visible entity bounds outside their district, and require exactly one changing coordinate per route segment. Mirror the same data structures and camelCase JSON serialization in the C++ SDK, including top-level layout and optional route data on pipe entities.

- [ ] **Step 4: Write failing detailed payload tests**

Assert required causal fields under declared capabilities and backward-compatible loose payloads without those capabilities:

```ts
expect(
  parseEvent(
    {
      cycle: 120,
      seq: 4,
      type: "register.read",
      scope: "scalar.prf",
      entity_id: "pe2.prf.reg37",
      payload: {
        instruction_id: 9812,
        thread_id: 2,
        phys_reg: 37,
        consumer_id: 9812,
        port: 1,
        role: "source",
      },
    },
    { capabilities: ["instruction-causality-v1"] },
  ),
).toMatchObject({ type: "register.read" });
```

Also reject negative thread/register indices, missing cache set/way on hit/fill, CELL byte counts outside 1..128, and detailed pipe events without `route_id`.

- [ ] **Step 5: Run schema tests and confirm RED**

Run: `npx vitest run packages/trace-schema/src/schemas.test.ts`

Expected: FAIL because the detailed payload schemas and capability declarations do not exist.

- [ ] **Step 6: Implement detailed payload types and schemas**

Define one shared causal base and event-specific extensions:

```ts
export interface CausalPayload {
  instruction_id?: number;
  request_id?: number;
  thread_id: 0 | 1 | 2 | 3;
  route_id?: string;
}

export interface DetailedCellPayload extends CausalPayload {
  phys_cell_id: number;
  pe: number;
  bank: number;
  row: number;
  byte_offset: number;
  bytes: number;
  operation: "read" | "write";
  source: "cube" | "vector" | "tlsu" | "gmma-mov";
  arbitration: "request" | "grant" | "conflict" | "serve";
}
```

Add optional `capabilities: string[]` to `TraceManifest`, `WriterOptions.capabilities` in the C++ SDK, and an optional capability context to `parseEvent`. Detailed payload validation is strict when the relevant capability is declared and remains backward-compatible when callers omit the context or open a legacy manifest.

- [ ] **Step 7: Regenerate JSON Schema and run focused gates**

Run:

```sh
npm run build --workspace @linxsimcity/trace-schema
npm run export-schema --workspace @linxsimcity/trace-schema
npx vitest run packages/topology/src packages/trace-schema/src
cmake --build build/sdk --target bundle_writer_test --parallel 2
ctest --test-dir build/sdk -R bundle_writer --output-on-failure
```

Expected: PASS; generated JSON Schema contains layout, capabilities, and detailed event fields.

- [ ] **Step 8: Commit and push Task 1**

```sh
git add packages/topology packages/trace-schema sdk/cpp
git commit -m "feat: define physical detailed trace contracts"
git push origin feat/implementation
```

---

### Task 2: Remote Logical Bundle and Causal Runtime State

**Repository:** LinxSimCity

**Files:**
- Modify: `packages/trace-runtime/src/bundle/types.ts`
- Modify: `packages/trace-runtime/src/bundle/entry-store.ts`
- Create: `packages/trace-runtime/src/bundle/http-entry-store.ts`
- Modify: `packages/trace-runtime/src/bundle/open-bundle.ts`
- Modify: `packages/trace-runtime/src/bundle/open-bundle.test.ts`
- Create: `packages/trace-runtime/src/causal/types.ts`
- Create: `packages/trace-runtime/src/causal/reduce-causal.ts`
- Create: `packages/trace-runtime/src/causal/reduce-causal.test.ts`
- Modify: `packages/trace-runtime/src/reducer/state.ts`
- Modify: `packages/trace-runtime/src/reducer/checkpoint.ts`
- Modify: `packages/trace-runtime/src/index.ts`

**Interfaces:**
- Consumes Task 1 detailed payloads and topology routes.
- Produces `HttpDirectorySource { kind: "http-directory"; baseUrl: string; fetch?: typeof fetch }`.
- Produces `CausalState`, `InstructionTraceState`, `MemoryRequestState`, `RobState`, `PrfState`, `CacheState`, and `CellRequestState` inside every `ViewerSnapshot`.

- [ ] **Step 1: Write failing HTTP store tests**

Use a fetch spy and assert metadata-first reads, safe relative URL resolution, 404 diagnostics, per-entry byte limits, and no whole-bundle fetch:

```ts
const reader = await TraceBundleReader.open({
  kind: "http-directory",
  baseUrl: "https://example.test/traces/fa-detail/",
  fetch: fetchTrace,
});
await reader.readManifest();
expect(fetchTrace).toHaveBeenCalledWith(
  "https://example.test/traces/fa-detail/manifest.json",
  expect.objectContaining({ signal: expect.any(AbortSignal) }),
);
```

- [ ] **Step 2: Run bundle tests and confirm RED**

Run: `npx vitest run packages/trace-runtime/src/bundle/open-bundle.test.ts`

Expected: FAIL because `http-directory` is not a source kind.

- [ ] **Step 3: Implement bounded HTTP entry loading**

Implement `HttpEntryStore.read(path)` using `assertSafeEntryPath`, `new URL(path, normalizedBase)`, a per-request abort controller, content-length precheck, streamed body accumulation with the existing 256 MiB entry bound, and a closed-state guard. Do not cache raw compressed bytes; decoded chunk LRU remains in `BundleReader`.

- [ ] **Step 4: Write failing causal reducer tests**

Feed a single instruction through rename, ROB, PRF read, cache miss/fill, TLSU response, writeback, and retire. Assert one causal instruction and one request connect all referenced resources. Add flush and shared-cache concurrent-thread cases.

```ts
expect(snapshot.causal.instructions.get(9812)).toMatchObject({
  threadId: 2,
  robSlot: 47,
  stage: "retire",
  sourceRegisters: [12],
  destinationRegisters: [37],
  requestIds: [7001],
  retired: true,
});
```

- [ ] **Step 5: Run causal tests and confirm RED**

Run: `npx vitest run packages/trace-runtime/src/causal/reduce-causal.test.ts`

Expected: FAIL because causal state does not exist.

- [ ] **Step 6: Implement immutable causal state transitions**

Keep sparse maps keyed by instruction/request/entity ID. Update only touched records, retain active route timing, and remove completed transient requests only after their visibility window. A flushed instruction sets `squashed=true` and can never transition to retired.

- [ ] **Step 7: Extend checkpoint serialization and seek equivalence tests**

Serialize causal state into checkpoint entities under reserved keys, restore it in `checkpoint.ts`, and add a test comparing forward reduction with checkpoint-plus-replay at the same cycle.

- [ ] **Step 8: Run focused runtime gates**

Run:

```sh
npx vitest run packages/trace-runtime/src
npm run typecheck --workspace @linxsimcity/trace-runtime
```

Expected: PASS with ZIP, node directory, browser directory, and HTTP logical bundle support.

- [ ] **Step 9: Commit and push Task 2**

```sh
git add packages/trace-runtime
git commit -m "feat: stream remote traces and rebuild causal state"
git push origin feat/implementation
```

---

### Task 3: Correct SuperScalarModel Topology and Physical Routes

**Repository:** SuperScalarModel trace worktree

**Files:**
- Modify: `TimingSim/trace/linx/topology_capacities.h`
- Create: `TimingSim/trace/linx/physical_layout.h`
- Create: `TimingSim/trace/linx/physical_layout.cpp`
- Modify: `TimingSim/trace/linx/topology_builder.h`
- Modify: `TimingSim/trace/linx/topology_builder.cpp`
- Modify: `TimingSim/trace/linx/entity_ids.h`
- Modify: `tests/linx_trace/topology_builder_test.cpp`
- Modify: `TimingSim/CMakeLists.txt`

**Interfaces:**
- Consumes Task 1 topology JSON contract.
- Produces exactly 8192 CELL entities, one shared I-Cache, one shared D-Cache, four PE-local ROB/PRF/IQ sets, physical placements, stable port IDs, and orthogonal routes.

- [ ] **Step 1: Write failing topology-count and route tests**

Assert:

```cpp
EXPECT_EQ(CountKind(topology, "cell"), 4u * 8u * 256u);
EXPECT_EQ(CountByIdPrefix(topology, "core.shared.l1i.set"), 1024u);
EXPECT_EQ(CountByIdPrefix(topology, "core.shared.l1d.set"), 1024u);
EXPECT_FALSE(HasEntity(topology, "pe0.l1d.set0.way0"));
EXPECT_TRUE(EveryRouteIsOrthogonal(topology));
EXPECT_TRUE(EveryVisibleEntityHasPlacement(topology));
```

- [ ] **Step 2: Build test and confirm RED**

Run:

```sh
cmake --build build-linx-latest --target topology_builder_test --parallel 2
ctest --test-dir build-linx-latest -R topology_builder --output-on-failure
```

Expected: FAIL on the current 2560 rows per bank, private cache IDs, and missing physical layout.

- [ ] **Step 3: Correct capacities and canonical IDs**

Set `kCellRowsPerBank=256`, keep `kCellBytes=128`, emit `pe{pe}.bg.bank{bank}.row{row}`, canonicalize ROB IDs as `pe{pe}.sperob.slot{slot}`, and use shared cache IDs `core.shared.l1i.set{set}.way{way}` and `core.shared.l1d.set{set}.way{way}`.

- [ ] **Step 4: Implement physical layout helpers**

Create deterministic helpers returning position, size, rotation, port position, and route points. Preserve the approved rectangular district layout, four CUBE PE strips aligned with four Tile quarters, StgBufB below CUBE, horizontal A routes, and vertical B routes.

- [ ] **Step 5: Emit physical layout and routes in topology JSON**

Add top-level `layout`; add placement for visible entities; add stable ports for pipeline, caches, PRF, CELL, CUBE, and TLSU; emit each pipe with `fromPortId`, `toPortId`, and orthogonal points.

- [ ] **Step 6: Run topology test and validate with LinxSimCity CLI**

Run:

```sh
ctest --test-dir build-linx-latest -R topology_builder --output-on-failure
cmake --build build-linx-latest --target write_synthetic --parallel 2
TRACE_TOPOLOGY_DIR="$(mktemp -d)/linxsimcity-physical-topology.trace-dir"
./build-linx-latest/linxsimcity-sdk/write_synthetic "$TRACE_TOPOLOGY_DIR"
node /Users/zhoubot/Documents/LinxSimCity/.worktrees/implementation/tools/linxtrace/dist/main.js validate "$TRACE_TOPOLOGY_DIR"
```

Expected: PASS and no missing placement/route/CELL-capacity diagnostics.

- [ ] **Step 7: Commit and push Task 3**

```sh
git add TimingSim/trace/linx tests/linx_trace
git commit -m "feat: emit physical LinxSimCity topology"
git push origin feat/linxsimcity-trace
```

---

### Task 4: Scalar Instruction, ROB, PRF, and Scoreboard Events

**Repository:** SuperScalarModel trace worktree

**Files:**
- Create: `TimingSim/trace/linx/detailed_event_payload.h`
- Create: `TimingSim/trace/linx/detailed_event_payload.cpp`
- Modify: `TimingSim/trace/linx/event_payload.{h,cpp}`
- Modify: `TimingSim/trace/InstTracer.cpp`
- Modify: `TimingSim/frontend/rob/SPEROB.cpp`
- Modify: `TimingSim/frontend/decode/DCTop.{h,cpp}`
- Modify: `TimingSim/frontend/rename/GPRRename.{h,cpp}`
- Modify: `TimingSim/frontend/rename/SPERename.{h,cpp}`
- Modify: `TimingSim/scalar_pe/iex/iex_dispatch.{h,cpp}`
- Modify: `TimingSim/scalar_pe/iex/iex_iq.{h,cpp}`
- Modify: `TimingSim/scalar_pe/iex/iex_rd_unit.{h,cpp}`
- Modify: `TimingSim/scalar_pe/iex/rtable.{h,cpp}`
- Modify: `TimingSim/scalar_pe/iex/pipe/alu_pipe.cpp`
- Modify: `TimingSim/scalar_pe/iex/pipe/bru_pipe.cpp`
- Modify: `TimingSim/scalar_pe/iex/pipe/cmd_pipe.cpp`
- Modify: `TimingSim/scalar_pe/iex/pipe/lda_pipe.cpp`
- Modify: `TimingSim/scalar_pe/iex/pipe/sta_pipe.cpp`
- Modify: `TimingSim/scalar_pe/iex/pipe/std_pipe.cpp`
- Modify: `TimingSim/trace/linx/profile_filter.cpp`
- Modify: `tests/linx_trace/scalar_trace_test.cpp`

**Interfaces:**
- Consumes Task 1 detailed payload field names and Task 3 entity/route IDs.
- Produces stable `instruction_id`, ordered stage events, real ROB state/pointers, PRF allocation/read/write/ready/free events, IQ/issue port/pipe IDs, and structured stall/flush reasons.

- [ ] **Step 1: Extend the scalar trace test with one complete instruction chain**

Run a bounded scalar ELF and assert one `instruction_id` has fetch, I$ lookup reference, decode, rename, dispatch, issue, PRF read, execution route, complete, PRF write, ROB ready, and retire. Assert a squashed instruction cannot retire.

- [ ] **Step 2: Build scalar trace test and confirm RED**

Run:

```sh
cmake --build build-linx-latest --target scalar_trace_test --parallel 2
ctest --test-dir build-linx-latest -R scalar_trace --output-on-failure
```

Expected: FAIL because current events lack stable instruction, PRF, route, and full ROB lifecycle fields.

- [ ] **Step 3: Add stable instruction identity and stage emission**

Derive `instruction_id` from existing model instruction identity, not cycle ordering. Reuse `CycleInfo`/`InstTracer` stage timestamps and existing `iq_name`; map authoritative issue output to `issue_port`, `pipe_id`, `fu_kind`, and `route_id`.

- [ ] **Step 4: Emit complete ROB lifecycle and pointers**

Emit allocate in `allocROB`, issue at the actual issue transition, complete at `CompleteROB`, ready-to-retire before commit eligibility, retire in commit, and flush/exception on squash. Emit explicit head/tail events only when pointers change.

- [ ] **Step 5: Emit rename, PRF, scoreboard, wakeup, and free events**

Use `psrcs_`, `pdsts_`, rename mapping, real PRF read ports, writeback broadcast, ready-table transitions, and free-list release. Include producer/consumer instruction IDs and physical register entity IDs.

- [ ] **Step 6: Compare trace-enabled and trace-disabled execution**

Run the same ELF twice and compare exit status, committed instruction count, cycle count, and result checksum. Any difference is a blocker.

- [ ] **Step 7: Run scalar focused gates**

Run:

```sh
ctest --test-dir build-linx-latest -R 'scalar_trace|linx_trace_adapter' --output-on-failure
```

Expected: PASS; the produced bundle validates with Task 1 schemas.

- [ ] **Step 8: Commit and push Task 4**

```sh
git add TimingSim/trace TimingSim/frontend TimingSim/scalar_pe tests/linx_trace
git commit -m "feat: trace scalar instruction and PRF causality"
git push origin feat/linxsimcity-trace
```

---

### Task 5: Shared I-Cache and D-Cache Line Events

**Repository:** SuperScalarModel trace worktree

**Files:**
- Modify: `TimingSim/scalar_pe/lsu/l1/L1DCache.{h,cpp}`
- Modify: `TimingSim/scalar_pe/lsu/l1/cluster.{h,cpp}`
- Modify: `TimingSim/frontend/ifu/iside/ifu_iside.cpp`
- Modify: `TimingSim/frontend/ifu/iside/ifu_icache.{h,cpp}`
- Modify: `TimingSim/frontend/ifu/base/ifu_utils.h`
- Modify: `TimingSim/trace/linx/detailed_event_payload.{h,cpp}`
- Create or modify: `tests/linx_trace/cache_trace_test.cpp`
- Modify: `tests/linx_trace/CMakeLists.txt`

**Interfaces:**
- Consumes shared cache IDs from Task 3 and instruction/request IDs from Task 4.
- Produces lookup/hit/miss/MSHR/fill/evict/write/writeback events with `thread_id`, request/instruction ID, line address, line bytes, set, way, tag, and state.

- [ ] **Step 1: Write failing shared-cache trace tests**

Assert four source threads may target one shared line in a cycle without generating four cache entities. Assert I$ access links to fetch instruction; D$ access links to TLSU request; cross-line access emits two ordered sub-accesses under one request ID.

- [ ] **Step 2: Build cache trace test and confirm RED**

Run: `cmake --build build-linx-latest --target cache_trace_test --parallel 2 && ctest --test-dir build-linx-latest -R cache_trace --output-on-failure`

Expected: FAIL because I$ detail, request linkage, and shared IDs are absent.

- [ ] **Step 3: Correct D-cache way reporting and emit full lifecycle**

Preserve the actual hit way before LRU updates, emit `cache.access` before result, `cache.hit` or `cache.miss` after lookup, MSHR allocation/release, victim eviction/writeback, fill, and data write. Do not report way 0 for every valid hit.

- [ ] **Step 4: Add I-cache lookup/miss/return events**

Use existing IFU stage boundaries and request metadata. Associate each request with fetch instruction and thread. Emit shared I-cache entity IDs and real set/way once resolved.

- [ ] **Step 5: Preserve architectural equivalence**

Run trace on/off and compare the scalar test's architectural result and cycle count.

- [ ] **Step 6: Run cache and scalar gates**

Run: `ctest --test-dir build-linx-latest -R 'cache_trace|scalar_trace' --output-on-failure`

Expected: PASS.

- [ ] **Step 7: Commit and push Task 5**

```sh
git add TimingSim/frontend TimingSim/scalar_pe/lsu TimingSim/trace/linx tests/linx_trace
git commit -m "feat: trace shared cache-line activity"
git push origin feat/linxsimcity-trace
```

---

### Task 6: CELL, StgBufB, CUBE, and TLSU Causal Events

**Repository:** SuperScalarModel trace worktree

**Files:**
- Modify: `TimingSim/pe/cell/CellReg.cpp`
- Modify: `TimingSim/pe/cube/CubeCore.cpp`
- Modify: `TimingSim/group/tlsu/tile_lsu.cpp`
- Modify: `TimingSim/group/b_staging_sram.{h,cpp}`
- Modify: `TimingSim/trace/linx/detailed_event_payload.{h,cpp}`
- Modify: `tests/linx_trace/dsa_trace_test.cpp`
- Create or modify: `tests/linx_trace/tlsu_trace_test.cpp`
- Modify: `tests/linx_trace/CMakeLists.txt`

**Interfaces:**
- Consumes Task 3 CELL/routes and Task 4/5 request identity.
- Produces exact CELL request/queue/arbitrate/grant/conflict/serve events, StgBufB subspace/cell events, horizontal A routes, vertical B broadcast, MAC stages, and complete TLSU stage chains.

- [ ] **Step 1: Write failing CELL and CUBE assertions**

Assert every served CELL satisfies `bank<8`, `row<256`, `bytes<=128`, and `phys_cell_id=bank+8*row`. Assert a conflict identifies both winner and loser request IDs. Assert A uses a horizontal route and B uses a vertical route from StgBufB.

- [ ] **Step 2: Write failing TLSU chain assertions**

For one tload and one tstore, assert stable request ID through issue, AGU, LDQ/STQ, BridgePairQ, split/coalesce, cache/global request, response buffer, CELL/PRF writeback, and completion.

- [ ] **Step 3: Build tests and confirm RED**

Run:

```sh
cmake --build build-linx-latest --target dsa_trace_test tlsu_trace_test --parallel 2
ctest --test-dir build-linx-latest -R 'dsa_trace|tlsu_trace' --output-on-failure
```

Expected: FAIL because current events report only coarse grant/read/write and module-level memory requests.

- [ ] **Step 4: Emit CELL request queues and arbitration outcomes**

Hook DispatchRequests/SplitToBanks, arbitration, and ServeBank. Compute `row` from the corrected 256-row mapping, include actual byte subrange, wait cycles, queue ID, source class, and stable request ID.

- [ ] **Step 5: Emit StgBufB and CUBE route detail**

Emit GMMA.LD global-memory→MTE→StgBufB, GMMA.MOV CELL→StgBufB, A/C local CELL routes, B vertical broadcast, four PE strip stages, accumulator, and writeback.

- [ ] **Step 6: Emit detailed TLSU stages**

Use existing `CycleInfo` bridge/tload/tstore fields and authoritative queue transitions. Emit distinct entity/route IDs for AGU, LDQ, STQ, BridgePairQ, read/write buffers, shared D$, L2/global memory, response, PRF, and CELL endpoints.

- [ ] **Step 7: Run DSA/TLSU equivalence and validation**

Run official bounded matrix/tile workloads with tracing off/on, compare exit/result checksums and committed block count, then validate the produced directory with `linxtrace validate`.

- [ ] **Step 8: Commit and push Task 6**

```sh
git add TimingSim/pe TimingSim/group TimingSim/trace/linx tests/linx_trace
git commit -m "feat: trace CELL CUBE and TLSU causality"
git push origin feat/linxsimcity-trace
```

---

### Task 7: Topology-Driven WebGL Structures and Route Tokens

**Repository:** LinxSimCity

**Files:**
- Create: `packages/scene-modules/src/topology/placement.ts`
- Create: `packages/scene-modules/src/topology/placement.test.ts`
- Create: `packages/scene-modules/src/topology/RoutePipe.tsx`
- Modify: `packages/scene-modules/src/City.tsx`
- Modify: `packages/scene-modules/src/common/InstancedBoxes.tsx`
- Modify: `packages/scene-modules/src/scalar/ScalarCpu.tsx`
- Create: `packages/scene-modules/src/scalar/PrfCells.tsx`
- Modify: `packages/scene-modules/src/scalar/RobRing.tsx`
- Modify: `packages/scene-modules/src/scalar/CacheCells.tsx`
- Modify: `packages/scene-modules/src/scalar/ExecutionPipes.tsx`
- Modify: `packages/scene-modules/src/cell/cell-mapping.ts`
- Modify: `packages/scene-modules/src/cell/cell-mapping.test.ts`
- Modify: `packages/scene-modules/src/cell/CellBanks.tsx`
- Modify: `packages/scene-modules/src/cell/Crossbar.tsx`
- Modify: `packages/scene-modules/src/tlsu/TlsuDistrict.tsx`
- Modify: `packages/scene-modules/src/flow/DataTokenLayer.tsx`
- Create: `packages/scene-modules/src/flow/thread-colors.ts`
- Create: `packages/scene-modules/src/flow/causal-routes.test.ts`

**Interfaces:**
- Consumes Task 1 physical topology and Task 2 causal snapshot.
- Produces a topology-driven city, selected-PE scalar detail, shared cache beams, exact 8192 CELL instances, detailed TLSU stages, and continuous route-based tokens.

- [ ] **Step 1: Write failing placement and route tests**

Assert entity transforms exactly match topology placement, route segments create straight pipes between consecutive points, legacy topology uses the old fixed layout, and detailed topology never falls back silently.

- [ ] **Step 2: Write failing physical-count and selection tests**

Assert `CELL_INSTANCE_COUNT===8192`, each `pe.bank.row` ID maps bijectively, selected PE changes visible ROB/PRF/IQ detail, and shared caches remain visible.

- [ ] **Step 3: Write failing causal route/color tests**

Assert an instruction token keeps one thread color across all stages; miss/stall/flush overlays do not replace it; clicking a token selects its instruction ID and related ROB/PRF/cache/TLSU/CELL entities.

- [ ] **Step 4: Run scene tests and confirm RED**

Run: `npx vitest run packages/scene-modules/src`

Expected: FAIL on missing topology placement, PRF cells, 8192 CELL mapping, selected PE, and causal routes.

- [ ] **Step 5: Implement topology transform and route primitives**

Convert placement tuples directly to Three.js transforms; render every orthogonal segment as a straight pipe; register entity IDs and instance IDs for picking.

- [ ] **Step 6: Rebuild scalar detail and shared caches**

Render selected PE ROB/PRF/IQ/pipes from topology; render I$/D$ once; show concurrent thread beams; use causal state for ROB lifecycle and PRF readiness/read/write overlays.

- [ ] **Step 7: Correct Tile CELL and expand TLSU**

Render four quarters × eight narrow banks × 256 flattened rows with instancing and LOD. Render AGU, LDQ, STQ, BridgePairQ, buffers, shared D$, L2/GM, and response routes from topology.

- [ ] **Step 8: Replace generic tokens with causal route tokens**

Interpolate by event start/end cycle and topology route length. Use distinct shapes for instruction, memory request, vector, GMMA, and Tile request while preserving owner thread color.

- [ ] **Step 9: Run scene gates**

Run:

```sh
npx vitest run packages/scene-modules/src
npm run typecheck --workspace @linxsimcity/scene-modules
```

Expected: PASS.

- [ ] **Step 10: Commit and push Task 7**

```sh
git add packages/scene-modules
git commit -m "feat: render the physical causal trace city"
git push origin feat/implementation
```

---

### Task 8: Full-Screen Viewer, Borderless Commit HUD, and Controls

**Repository:** LinxSimCity

**Files:**
- Modify: `apps/viewer/src/app/App.tsx`
- Modify: `apps/viewer/src/app/App.test.tsx`
- Modify: `apps/viewer/src/app/styles.css`
- Create: `apps/viewer/src/hud/CommitHud.tsx`
- Create: `apps/viewer/src/hud/CommitHud.test.tsx`
- Create: `apps/viewer/src/input/use-city-controls.ts`
- Create: `apps/viewer/src/input/use-city-controls.test.tsx`
- Modify: `apps/viewer/src/player/types.ts`
- Modify: `apps/viewer/src/player/player-store.ts`
- Modify: `apps/viewer/src/player/player-store.test.ts`
- Modify: `apps/viewer/src/scene/SceneViewport.tsx`
- Modify: `apps/viewer/src/timeline/Timeline.tsx`

**Interfaces:**
- Consumes Task 2 causal state and Task 7 scene selection/focus.
- Produces selected PE `0..3`, live commit instruction, pinned instruction, follow mode, full-screen layout, borderless HUD, and approved mouse/keyboard commands.

- [ ] **Step 1: Write failing full-screen shell tests**

Assert no topbar/sidebar/panel containers render, the canvas fills the app, trace loading remains accessible as an unobtrusive overlay, and diagnostics are borderless overlays.

- [ ] **Step 2: Write failing HUD tests**

Assert live commit remains visible while another instruction is pinned, includes cycle/thread/PC/disassembly/ROB/PRF/pipe/cache/TLSU path, and keeps a bounded recent-commit list.

- [ ] **Step 3: Write failing keyboard-control tests**

Assert arrows move camera, `Shift+Left/Right` step cycles, Space toggles playback, `1..4` select PE, `F` enables follow, and Escape clears pinned instruction. Ignore shortcuts while typing in an input/select/textarea/contenteditable element.

- [ ] **Step 4: Run viewer tests and confirm RED**

Run: `npx vitest run apps/viewer/src/app apps/viewer/src/hud apps/viewer/src/input apps/viewer/src/player`

Expected: FAIL because the current panel layout and key bindings differ.

- [ ] **Step 5: Extend player state**

Add `selectedPe`, `followCommit`, `pinnedInstructionId`, `liveCommit`, and bounded `recentCommits`; keep these states consistent across seek, unload, local trace replacement, and default trace retry.

- [ ] **Step 6: Implement Commit HUD and full-screen styles**

Use semantic transparent overlays with text shadow only; no background card, border, or persistent reserved column. Keep the live commit above pinned trace.

- [ ] **Step 7: Implement controls and camera integration**

Use OrbitControls for mouse behavior and explicit camera translation for arrows. Preserve Space play/pause and move cycle stepping to Shift+arrows.

- [ ] **Step 8: Run viewer gates**

Run:

```sh
npx vitest run apps/viewer/src
npm run typecheck --workspace @linxsimcity/viewer
```

Expected: PASS.

- [ ] **Step 9: Commit and push Task 8**

```sh
git add apps/viewer
git commit -m "feat: add the full-screen commit trace viewer"
git push origin feat/implementation
```

---

### Task 9: Generate and Publish the Detailed FA Logical Bundle

**Repositories:** SuperScalarModel and LinxSimCity

**Files:**
- Modify: `scripts/generate-supernpubench-showcase.mjs`
- Modify: `tests/showcase/generate-supernpubench-showcase.test.ts`
- Replace: `tests/showcase/default-fa-asset.test.ts` with logical-bundle tests
- Modify: `apps/viewer/src/loader/default-trace.ts`
- Modify: `apps/viewer/src/loader/default-trace.test.ts`
- Create: `apps/viewer/public/traces/fa-detail/` generated logical bundle
- Modify: `scripts/verify-pages-build.mjs`
- Modify: `tests/pages-deployment.test.ts`
- Modify: `docs/showcase.md`

**Interfaces:**
- Consumes all detailed model and Viewer contracts.
- Produces the default remote logical source `/LinxSimCity/traces/fa-detail/` and keeps local ZIP file selection.

- [ ] **Step 1: Write failing generator and asset tests**

Assert the plan requests the detailed capability set, no longer packs the default public asset as one ZIP, publishes metadata/checkpoints/chunks, verifies every indexed hash, and requires real events for scalar stages, ROB, PRF, shared I$/D$, CELL, CUBE, and TLSU.

- [ ] **Step 2: Run showcase/Page tests and confirm RED**

Run: `npx vitest run tests/showcase tests/pages-deployment.test.ts apps/viewer/src/loader/default-trace.test.ts`

Expected: FAIL because the default source is one archive and lacks detailed events.

- [ ] **Step 3: Update the generator for detailed logical output**

Run SuperScalarModel with the detailed profile/capabilities, validate the logical directory, retain provenance, and copy only validated logical files to `apps/viewer/public/traces/fa-detail/`. Refuse overwrite unless an explicit generated-output replacement step validates the old and new provenance.

- [ ] **Step 4: Generate the detailed FA trace sequentially**

Use the official SuperNPUBench FA ELF and the established first-250-block boundary (`-m 250`) while the known full-program model completion defect remains. Do not run concurrent builds. Record model commit, LinxSimCity commit, ELF hash, event counts, cycle range, and exact completion boundary; promote a full-program trace only if the model exits successfully and passes the same architectural validation.

- [ ] **Step 5: Validate detailed trace contents**

Run:

```sh
node tools/linxtrace/dist/main.js validate apps/viewer/public/traces/fa-detail
node tools/linxtrace/dist/main.js inspect apps/viewer/public/traces/fa-detail --json
```

Additionally count required event families and reject zero counts.

- [ ] **Step 6: Switch default loader to HTTP logical source**

Create `{ kind: "http-directory", baseUrl: new URL("traces/fa-detail/", BASE_URL) }`, retain load-generation cancellation, StrictMode request reuse, retry, and local file override.

- [ ] **Step 7: Verify production Pages output**

Extend `verify-pages-build.mjs` to validate manifest/topology/index, every indexed chunk/checkpoint path and hash, `8192` CELL entities, required capabilities, and `/LinxSimCity/` asset paths.

- [ ] **Step 8: Run focused publishing gates**

Run:

```sh
npx vitest run tests/showcase tests/pages-deployment.test.ts apps/viewer/src/loader
npm run pages:verify
```

Expected: PASS and production artifact contains the complete logical bundle.

- [ ] **Step 9: Commit and push Task 9**

```sh
git add scripts tests apps/viewer/public apps/viewer/src/loader docs/showcase.md
git commit -m "feat: publish the detailed FA trace bundle"
git push origin feat/implementation
```

---

### Task 10: Cross-Repository Acceptance, Review, and Public Deployment

**Repositories:** LinxSimCity and SuperScalarModel

**Files:**
- Modify only files required by review findings
- Append: `docs/showcase.md` acceptance evidence
- Update: root `README.md` only if public controls or URL documentation changed

**Interfaces:**
- Consumes the complete implementation.
- Produces independently reviewed commits, green CI, updated `main`, deployed GitHub Pages, and public browser evidence.

- [ ] **Step 1: Run memory-bounded LinxSimCity verification**

Run sequentially:

```sh
npm run check
npm run build
npm run pages:verify
cmake --build build/sdk --parallel 2
ctest --test-dir build/sdk --output-on-failure
```

Expected: all PASS; no command runs concurrently.

- [ ] **Step 2: Run memory-bounded SuperScalarModel verification**

Run targeted trace tests first, then the approved bounded workload with tracing off/on and trace validation. Use `--parallel 2` at most.

- [ ] **Step 3: Request independent cross-repository code review**

Review exact task commit ranges for contract correctness, architectural truth, concurrency, resource bounds, WebGL instance/picking consistency, and public deployment safety. Fix every Critical/Important finding with a regression test and scoped re-review.

- [ ] **Step 4: Run local production browser acceptance**

Verify:

- default logical bundle begins at 1× and cycle advances;
- live commit HUD updates;
- PE switching changes scalar detail;
- one locked instruction lights real ROB, PRF, pipe, cache, TLSU, and CELL resources;
- arrow/mouse/Shift-step/Space/F/Escape controls work;
- local ZIP trace replacement still works;
- no panel borders or reserved sidebar remain.

- [ ] **Step 5: Push both feature branches and wait for CI**

Push without force. Wait for all required checks on both repositories. Do not update public `main` while either CI is failing.

- [ ] **Step 6: Fast-forward approved main branches**

Confirm remote main is an ancestor before each push. Use `git push origin HEAD:main` only when fast-forward is proven.

- [ ] **Step 7: Wait for Pages deployment and verify public assets**

Verify HTTPS 200 for page and metadata, validate public index/chunk hashes, and confirm production HTML uses `/LinxSimCity/assets/`.

- [ ] **Step 8: Run public browser acceptance**

Repeat the default playback, live commit, PE switch, instruction lock, and cycle-advance checks at `https://linxisa.github.io/LinxSimCity/`.

- [ ] **Step 9: Record final evidence and retain worktrees**

Record final commits, CI/Page run URLs, public trace provenance, tests, and known workload boundary. Preserve both worktrees for follow-up unless the user explicitly requests cleanup.

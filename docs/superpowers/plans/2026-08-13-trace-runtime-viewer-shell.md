# LinxSimCity Trace Runtime and Viewer Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline browser application that loads `.linxtrace`, validates it, performs checkpoint-based arbitrary seek in a worker, and exposes deterministic playback state to the later WebGL scene.

**Architecture:** `trace-runtime` owns bundle access, decompression, indexing, checkpoint restore, and the pure state reducer. A Comlink Web Worker exposes load/seek APIs; a Zustand store owns playback and selected-entity UI state. The React/Vite viewer shell renders file loading, timeline, controls, diagnostics, and Demo/Expert inspectors without implementing the physical 3D city yet.

**Tech Stack:** React 19.2.8, React DOM 19.2.8, Vite 8.2.1, TypeScript 7.0.2, Zustand 5.0.14, Comlink 4.4.2, zip.js 2.8.43, fflate 0.8.3, Vitest 4.1.10, Playwright 1.62.1.

## Global Constraints

- Plan 1 and tag `trace-contract-v1.0.0` must be complete first.
- Viewer is offline-only; no fetch to a server is required for user-selected trace files.
- Target dataset is 100,000 cycles and 1–5 million events.
- Default chunk span is 4096 cycles; reader honors the manifest value.
- Random seek restores the nearest checkpoint and replays only to the target cycle.
- Reducer is pure and deterministic; scene code consumes snapshots but is absent from this plan.
- Missing profile data is displayed as unavailable, never as idle hardware.
- All fatal load failures preserve manifest metadata and structured diagnostics.

---

## File Structure

```text
packages/trace-runtime/src/bundle/       directory/ZIP readers
packages/trace-runtime/src/reducer/      pure hardware-state reducer
packages/trace-runtime/src/worker/       Comlink worker API
packages/trace-runtime/src/performance/  synthetic large-trace generator
apps/viewer/src/app/                     app shell and routing-free composition
apps/viewer/src/player/                  playback store and clock
apps/viewer/src/timeline/                timeline and cycle navigation
apps/viewer/src/inspector/               Demo/Expert selected state
apps/viewer/src/diagnostics/              fatal/warning presentation
tests/e2e/                               Playwright browser behavior
```

### Task 1: Browser Bundle Reader

**Files:**
- Create: `packages/trace-runtime/package.json`
- Create: `packages/trace-runtime/tsconfig.json`
- Create: `packages/trace-runtime/src/bundle/types.ts`
- Create: `packages/trace-runtime/src/bundle/directory-reader.ts`
- Create: `packages/trace-runtime/src/bundle/zip-reader.ts`
- Create: `packages/trace-runtime/src/bundle/open-bundle.ts`
- Create: `packages/trace-runtime/src/bundle/decode.ts`
- Create: `packages/trace-runtime/src/index.ts`
- Test: `packages/trace-runtime/src/bundle/open-bundle.test.ts`

**Interfaces:**
- Consumes: `TraceManifest`, `TraceIndex`, `TopologyDescriptor` from Plan 1.
- Produces: `TraceBundleReader.open(source)`, `readManifest()`, `readTopology()`, `readIndex()`, `readChunk(entry)`, `readCheckpoint(path)`, `close()`.
- `source` is `File | FileSystemDirectoryHandle | NodeFixtureSource`.

- [ ] **Step 1: Write failing directory/ZIP parity tests**

Open the Plan 1 minimal fixture in directory and ZIP forms and assert equal parsed manifest, topology entity count, chunk event arrays, and checkpoint bytes.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run packages/trace-runtime/src/bundle/open-bundle.test.ts`

Expected: FAIL because bundle reader does not exist.

- [ ] **Step 3: Define the reader interface**

```ts
export interface TraceBundleReader {
  readManifest(): Promise<TraceManifest>;
  readTopology(): Promise<TopologyDescriptor>;
  readIndex(): Promise<TraceIndex>;
  readChunk(entry: ChunkIndexEntry): Promise<readonly EventEnvelope[]>;
  readCheckpoint(path: string): Promise<CheckpointState>;
  close(): Promise<void>;
}
```

Directory and ZIP implementations share `decodeGzipJson` and `decodeGzipJsonLines` helpers. Reject path traversal entries and files above manifest-declared limits.

- [ ] **Step 4: Implement lazy entry access**

Use zip.js to read only the selected ZIP entry. Do not call a whole-archive unzip API. Cache manifest, topology, and index; keep at most three decoded chunks in an LRU cache.

- [ ] **Step 5: Run tests**

Run: `npx vitest run packages/trace-runtime/src/bundle/open-bundle.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/trace-runtime package.json package-lock.json
git commit -m "feat: add lazy trace bundle reader"
```

### Task 2: Pure State Reducer and Checkpoint Seek

**Files:**
- Create: `packages/trace-runtime/src/reducer/state.ts`
- Create: `packages/trace-runtime/src/reducer/reduce-event.ts`
- Create: `packages/trace-runtime/src/reducer/checkpoint.ts`
- Create: `packages/trace-runtime/src/reducer/seek.ts`
- Create: `packages/trace-runtime/src/reducer/entity-state.ts`
- Test: `packages/trace-runtime/src/reducer/reduce-event.test.ts`
- Test: `packages/trace-runtime/src/reducer/seek.test.ts`

**Interfaces:**
- Produces: `ViewerSnapshot`, `EntityState`, `ActiveEvent`, `initialSnapshot(topology)`, `reduceEvent(snapshot, event)`, `seekToCycle(reader, cycle)`.
- `ViewerSnapshot` contains `cycle`, `entities: ReadonlyMap<string, EntityState>`, `activeEvents`, `profileAvailability`, and `changedEntityIds`.

- [ ] **Step 1: Write failing reducer invariants**

Cover cache hit/miss/fill, ROB allocate/retire/wrap/flush, queue full/release, CELL read/write/grant/conflict, pipeline enter/leave/stall, and unknown optional event types.

```ts
const next = reduceEvent(initial, cellConflict);
expect(next.entities.get('pe0.bg.bank3.row9')?.status).toBe('conflict');
expect(initial.entities.get('pe0.bg.bank3.row9')?.status).toBe('idle');
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/trace-runtime/src/reducer`

Expected: FAIL because reducer functions are missing.

- [ ] **Step 3: Implement immutable, sparse updates**

Clone only changed entity entries. Clear transient highlights at cycle boundaries through a tracked `transientEntityIds` set; never scan the entire topology. Return changed IDs in stable lexical order for deterministic tests.

- [ ] **Step 4: Implement checkpoint seek**

Binary-search `TraceIndex.chunks` for the target cycle, load its checkpoint, and replay ordered events through the target cycle. Reject cycles outside manifest range with `cycle_out_of_range`.

- [ ] **Step 5: Prove seek equivalence**

Generate snapshots for every synthetic cycle by both linear replay and random checkpoint seek. Assert deep equality after normalizing Maps.

Run: `npx vitest run packages/trace-runtime/src/reducer`

Expected: PASS for all cycles.

- [ ] **Step 6: Commit**

```bash
git add packages/trace-runtime/src/reducer
git commit -m "feat: add deterministic trace state reducer"
```

### Task 3: Worker API and Cancellation

**Files:**
- Create: `packages/trace-runtime/src/worker/protocol.ts`
- Create: `packages/trace-runtime/src/worker/trace-worker.ts`
- Create: `packages/trace-runtime/src/worker/client.ts`
- Create: `packages/trace-runtime/src/worker/errors.ts`
- Test: `packages/trace-runtime/src/worker/client.test.ts`

**Interfaces:**
- Produces `TraceWorkerApi`:

```ts
export interface TraceWorkerApi {
  load(source: WorkerTraceSource): Promise<LoadedTraceInfo>;
  seek(cycle: number, requestId: number): Promise<SerializedViewerSnapshot>;
  eventsAt(cycle: number): Promise<readonly EventEnvelope[]>;
  entityHistory(entityId: string, from: number, to: number): Promise<readonly EventEnvelope[]>;
  close(): Promise<void>;
}
```

- [ ] **Step 1: Write failing worker tests**

Assert load, seek, event query, newer-request cancellation, and structured propagation of invalid-bundle diagnostics.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/trace-runtime/src/worker/client.test.ts`

Expected: FAIL because worker API is missing.

- [ ] **Step 3: Implement Comlink API**

Use monotonically increasing `requestId`. Before returning a seek result, compare it with `latestSeekRequestId`; throw `SeekSupersededError` for stale work. Serialize Maps as ordered `[entityId, state]` tuples.

- [ ] **Step 4: Add worker error normalization**

Normalize errors to `{ code, message, path?, fatal, details? }`. Preserve unsupported schema, checksum, decompression, missing file, and entity-reference codes from Plan 1.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npx vitest run packages/trace-runtime/src/worker/client.test.ts
npm run typecheck -w @linxsimcity/trace-runtime
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/trace-runtime/src/worker
git commit -m "feat: move trace loading and seek into a worker"
```

### Task 4: Viewer App Shell and Playback Store

**Files:**
- Create: `apps/viewer/package.json`
- Create: `apps/viewer/tsconfig.json`
- Create: `apps/viewer/vite.config.ts`
- Create: `apps/viewer/index.html`
- Create: `apps/viewer/src/main.tsx`
- Create: `apps/viewer/src/app/App.tsx`
- Create: `apps/viewer/src/app/styles.css`
- Create: `apps/viewer/src/player/player-store.ts`
- Create: `apps/viewer/src/player/playback-clock.ts`
- Create: `apps/viewer/src/player/types.ts`
- Test: `apps/viewer/src/player/player-store.test.ts`

**Interfaces:**
- Consumes: `TraceWorkerClient` and serialized snapshots.
- Produces: `usePlayerStore`, actions `loadTrace`, `seek`, `play`, `pause`, `step`, `setRate`, `setMode`, `selectEntity`.
- State machine: `empty | loading | ready | playing | error`.

- [ ] **Step 1: Write failing store transition tests**

Test load success/error, seek cancellation, play at end cycle, step bounds, 0.25×/0.5×/1×/2×/4× rates, Demo/Expert selection, and unload cleanup.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run apps/viewer/src/player/player-store.test.ts`

Expected: FAIL because store does not exist.

- [ ] **Step 3: Implement the Vite app and store**

Use one store; do not mirror worker snapshots in component-local state. Playback clock schedules by `requestAnimationFrame`, advances integer cycles based on elapsed wall time and rate, and pauses while a seek is pending.

- [ ] **Step 4: Add an explicit scene placeholder boundary**

`App.tsx` renders `<SceneViewport snapshot={snapshot} topology={topology} />`, implemented in this plan as an accessible placeholder showing cycle and changed entity count. This prop contract is consumed unchanged by Plan 3.

- [ ] **Step 5: Run tests and production build**

Run:

```bash
npx vitest run apps/viewer/src/player/player-store.test.ts
npm run build -w @linxsimcity/viewer
```

Expected: PASS and `apps/viewer/dist/index.html` exists.

- [ ] **Step 6: Commit**

```bash
git add apps/viewer package.json package-lock.json
git commit -m "feat: add viewer shell and playback state"
```

### Task 5: Trace Loader and Structured Diagnostics UI

**Files:**
- Create: `apps/viewer/src/loader/TraceDropzone.tsx`
- Create: `apps/viewer/src/loader/use-trace-loader.ts`
- Create: `apps/viewer/src/diagnostics/DiagnosticsPanel.tsx`
- Create: `apps/viewer/src/diagnostics/diagnostic-copy.ts`
- Create: `apps/viewer/src/diagnostics/download-report.ts`
- Test: `apps/viewer/src/loader/TraceDropzone.test.tsx`
- Test: `apps/viewer/src/diagnostics/DiagnosticsPanel.test.tsx`

**Interfaces:**
- Consumes: player `loadTrace` and normalized diagnostics.
- Produces: file picker and drag/drop for one `.linxtrace`; optional directory picker when browser supports it.

- [ ] **Step 1: Write failing UI tests**

Assert loading progress, wrong extension, unsupported major version, checksum failure, warning rendering, validation report download, and retry without reloading the page.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run apps/viewer/src/loader apps/viewer/src/diagnostics`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement loader and diagnostics**

Fatal errors show code, message, path, schema version, model commit, and a retry action. Warnings remain accessible after successful load. Downloaded report is deterministic JSON with no local filesystem path leakage.

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/viewer/src/loader apps/viewer/src/diagnostics`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/viewer/src/loader apps/viewer/src/diagnostics
git commit -m "feat: add offline trace loading diagnostics"
```

### Task 6: Timeline, Playback Controls, and Inspector

**Files:**
- Create: `apps/viewer/src/timeline/Timeline.tsx`
- Create: `apps/viewer/src/timeline/PlaybackControls.tsx`
- Create: `apps/viewer/src/timeline/CycleInput.tsx`
- Create: `apps/viewer/src/inspector/Inspector.tsx`
- Create: `apps/viewer/src/inspector/DemoInspector.tsx`
- Create: `apps/viewer/src/inspector/ExpertInspector.tsx`
- Test: `apps/viewer/src/timeline/Timeline.test.tsx`
- Test: `apps/viewer/src/inspector/Inspector.test.tsx`

**Interfaces:**
- Consumes: player store, `eventsAt`, `entityHistory`.
- Produces: accessible controls and selected-entity presentation used by Plan 3 picking.

- [ ] **Step 1: Write failing interaction tests**

Test keyboard Space play/pause, Left/Right single-cycle step, cycle input clamping, scrub coalescing, playback-rate selection, profile-unavailable copy, and Expert raw-event output.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run apps/viewer/src/timeline apps/viewer/src/inspector`

Expected: FAIL because controls are missing.

- [ ] **Step 3: Implement controls and inspectors**

Scrubbing sends at most one seek per animation frame. Demo inspector shows label, status, occupancy, and one current event. Expert inspector adds entity ID, instance fields, ports, stage, request ID, stall reason, raw payload, and profile availability.

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/viewer/src/timeline apps/viewer/src/inspector`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/viewer/src/timeline apps/viewer/src/inspector apps/viewer/src/app/App.tsx
git commit -m "feat: add trace timeline and expert inspector"
```

### Task 7: Browser E2E and Runtime Performance Baseline

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/viewer-shell.spec.ts`
- Create: `tests/e2e/fixtures.ts`
- Create: `packages/trace-runtime/src/performance/generate-large-trace.ts`
- Create: `tests/performance/seek-benchmark.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes all Plan 2 APIs.
- Produces benchmark JSON: `{ dataset, loadMs, indexMs, seekP50Ms, seekP95Ms, peakHeapBytes }`.

- [ ] **Step 1: Write failing E2E and performance tests**

E2E loads the minimal fixture, seeks to cycle 128, toggles Expert, verifies event details, plays to 132, and reloads an invalid trace. Benchmark uses 100,000 cycles and 5,000,000 deterministic events.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npx playwright test tests/e2e/viewer-shell.spec.ts
npx vitest run tests/performance/seek-benchmark.test.ts
```

Expected: FAIL until fixtures and benchmark harness are wired.

- [ ] **Step 3: Implement fixture helpers and benchmark reporting**

Set the initial random-seek acceptance gate to P95 ≤ 250ms after bundle load on the CI benchmark runner. Store raw results as a CI artifact; do not gate initial load time until a baseline exists.

- [ ] **Step 4: Run all Plan 2 gates**

```bash
npm run check
npm run build -w @linxsimcity/viewer
npx playwright test tests/e2e/viewer-shell.spec.ts
npx vitest run tests/performance/seek-benchmark.test.ts
```

Expected: all PASS; no browser console errors.

- [ ] **Step 5: Commit and push**

```bash
git add playwright.config.ts tests packages/trace-runtime/src/performance .github/workflows/ci.yml README.md
git commit -m "test: add viewer runtime end-to-end and seek gates"
git push origin main
```

## Plan 2 Completion Gate

- Directory and ZIP bundles load offline with equal results.
- Linear replay and checkpoint seek produce identical snapshots.
- Worker cancellation prevents stale seek results from replacing newer ones.
- Playback, cycle input, scrub, Demo/Expert, and diagnostics work without Three.js.
- 5-million-event random seek P95 is at most 250ms after load.
- Scene boundary props are stable for Plan 3.

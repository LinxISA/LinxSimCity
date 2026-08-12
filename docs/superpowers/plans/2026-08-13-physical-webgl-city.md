# LinxSimCity Physical WebGL City Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Plan 2 scene placeholder with the complete interactive WebGL city whose physical instances, pipes, highlights, picking, camera presets, and LOD are driven by topology and trace snapshots.

**Architecture:** `scene-core` owns renderer lifecycle, picking, cameras, instancing utilities, and LOD. `scene-modules` owns one renderer adapter per hardware district. Layout code consumes structural placement hints and produces Three.js coordinates, keeping the trace contract independent of visual tuning.

**Tech Stack:** Three.js 0.185.1, @react-three/fiber 9.7.0, @react-three/drei 10.7.8, React 19.2.8, Vitest 4.1.10, Playwright 1.62.1.

## Global Constraints

- Plans 1 and 2 must pass before starting.
- Core remains a horizontal rectangle with fixed district order: Scalar, Vector, CELL, CUBE, StgBufB below CUBE, TLSU across the bottom.
- Four BG quarters align one-to-one with four horizontal CUBE PE strips.
- A flows horizontally left-to-right; B broadcasts vertically upward/downward from StgBufB.
- All main links are 3D straight pipes with only required 90-degree bends.
- CELL count is 8192; L1I and L1D each have 1024 lines; SPEROB has 128 slots.
- Instance state updates are sparse; no per-frame scan of all CELL instances.
- Internal module placement may change during integration, but district boundaries and main flow directions may not.

---

## File Structure

```text
packages/scene-core/src/renderer/       Canvas and frame loop
packages/scene-core/src/layout/         deterministic physical coordinates
packages/scene-core/src/instancing/     sparse instance buffers
packages/scene-core/src/picking/        entity-id resolution
packages/scene-core/src/camera/         focus presets
packages/scene-core/src/lod/            district/bank/cell visibility
packages/scene-modules/src/scalar/      CPU, caches, pipes, ROB
packages/scene-modules/src/vector/      vector slices
packages/scene-modules/src/cell/        BG/CELL banks and crossbars
packages/scene-modules/src/cube/        GMMA matrix and StgBufB
packages/scene-modules/src/tlsu/        memory district
packages/scene-modules/src/flow/        token animation on straight pipes
apps/viewer/src/scene/                  app-to-scene adapter
tests/visual/                           topology and screenshots
```

### Task 1: Scene Core, Layout Contract, and Sparse Instance Buffers

**Files:**
- Create: `packages/scene-core/package.json`
- Create: `packages/scene-core/src/renderer/SceneCanvas.tsx`
- Create: `packages/scene-core/src/layout/types.ts`
- Create: `packages/scene-core/src/layout/resolve-layout.ts`
- Create: `packages/scene-core/src/instancing/instance-registry.ts`
- Create: `packages/scene-core/src/instancing/sparse-colors.ts`
- Create: `packages/scene-core/src/index.ts`
- Test: `packages/scene-core/src/layout/resolve-layout.test.ts`
- Test: `packages/scene-core/src/instancing/sparse-colors.test.ts`

**Interfaces:**
- Consumes: `TopologyDescriptor`, `ViewerSnapshot`.
- Produces: `ResolvedLayout`, `SceneEntity`, `InstanceRegistry`, `applySnapshotDelta(snapshot.changedEntityIds)`.

- [ ] **Step 1: Write failing layout and sparse-update tests**

Assert district bounds, PE alignment, StgBufB below CUBE, no district overlap, stable coordinates, and that changing five CELL IDs performs exactly five color writes.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/scene-core/src`

Expected: FAIL because scene core does not exist.

- [ ] **Step 3: Implement deterministic layout resolution**

Use normalized district bounds:

```ts
export const CORE_BOUNDS = { x: -72, z: -30, width: 125, depth: 70 };
export const DISTRICT_BOUNDS = {
  scalar: { x: -72, z: -30, width: 14, depth: 54 },
  vector: { x: -57, z: -30, width: 18, depth: 54 },
  cell: { x: -38, z: -30, width: 24, depth: 54 },
  cube: { x: -13, z: -30, width: 66, depth: 54 },
  stgbufb: { x: -6, z: 20.7, width: 59, depth: 4.6 },
  tlsu: { x: -72, z: 26, width: 125, depth: 14 }
} as const;
```

Allow module-specific offsets in layout constants, never in topology events.

- [ ] **Step 4: Implement sparse instance state**

Store `entityId → { meshKey, instanceId }`. Batch changed instance IDs per mesh and set `instanceColor.needsUpdate` once per mesh per snapshot.

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run packages/scene-core/src && npm run build -w @linxsimcity/scene-core`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene-core package.json package-lock.json
git commit -m "feat: add deterministic WebGL scene core"
```

### Task 2: Picking, Camera Presets, and LOD

**Files:**
- Create: `packages/scene-core/src/picking/picker.ts`
- Create: `packages/scene-core/src/picking/hover-store.ts`
- Create: `packages/scene-core/src/camera/presets.ts`
- Create: `packages/scene-core/src/camera/CameraController.tsx`
- Create: `packages/scene-core/src/lod/lod-policy.ts`
- Test: `packages/scene-core/src/picking/picker.test.ts`
- Test: `packages/scene-core/src/lod/lod-policy.test.ts`

**Interfaces:**
- Produces: `pickEntity(intersection)`, focus names `city|scalar|cell|cube|tlsu`, and LOD levels `district|bank|cell`.

- [ ] **Step 1: Write failing mapping and threshold tests**

Assert an instanced hit maps to the exact entity ID, blank click clears selection, focus presets contain target/bounds, and LOD thresholds include hysteresis.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/scene-core/src/picking packages/scene-core/src/lod`

Expected: FAIL.

- [ ] **Step 3: Implement picking and camera transitions**

Picking reads `mesh.userData.instanceEntityIds[instanceId]`. Camera transitions use damped interpolation and preserve OrbitControls after reaching the preset.

- [ ] **Step 4: Implement LOD policy**

Use distance bands with 10% hysteresis: district above 125 units, bank from 55–137.5, cell below 60. Expert selection forces the selected entity's cell mesh visible.

- [ ] **Step 5: Test and commit**

```bash
npx vitest run packages/scene-core/src/picking packages/scene-core/src/lod
git add packages/scene-core/src/picking packages/scene-core/src/camera packages/scene-core/src/lod
git commit -m "feat: add scene picking cameras and LOD"
```

### Task 3: Gem5-Style Scalar CPU District

**Files:**
- Create: `packages/scene-modules/package.json`
- Create: `packages/scene-modules/src/scalar/scalar-layout.ts`
- Create: `packages/scene-modules/src/scalar/ScalarCpu.tsx`
- Create: `packages/scene-modules/src/scalar/CacheCells.tsx`
- Create: `packages/scene-modules/src/scalar/RobRing.tsx`
- Create: `packages/scene-modules/src/scalar/ExecutionPipes.tsx`
- Create: `packages/scene-modules/src/common/Building.tsx`
- Create: `packages/scene-modules/src/common/StraightPipe.tsx`
- Test: `packages/scene-modules/src/scalar/scalar-layout.test.ts`
- Test: `packages/scene-modules/src/scalar/scalar-instances.test.tsx`

**Interfaces:**
- Consumes: scalar topology entities and snapshot deltas.
- Produces: exact instance registrations for 1024 L1I lines, 1024 L1D lines, and 128 SPEROB slots.

- [ ] **Step 1: Write failing instance and floorplan tests**

Assert all scalar modules exist, pipeline order is Fetch→Decode→Rename→IQ→pipes→ROB→Commit, caches map set/way correctly, ROB slot angle preserves program order, and pipes are cylinders.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/scene-modules/src/scalar`

Expected: FAIL.

- [ ] **Step 3: Implement the compressed Gem5 floorplan**

Rotate Gem5SimCity's long CPU axis into the narrow scalar district. Use SuperScalarModel labels: L1I, BPU/BTB, Fetch F0–F3, Decode, Rename/PRF, IEX IQ, Load Queue, Store Queue, INT/FP/LOAD/STORE pipes, SPEROB, Commit, Scoreboard, L1D.

- [ ] **Step 4: Implement physical Cache and ROB instances**

Cache mapping is `instanceId = set * ways + way`. ROB mapping is `angle = slot / 128 * 2π - π/2`. Use trace colors for hit/miss/fill, allocated/head/tail/retire/flush.

- [ ] **Step 5: Test and commit**

```bash
npx vitest run packages/scene-modules/src/scalar
git add packages/scene-modules package.json package-lock.json
git commit -m "feat: render Gem5-style scalar CPU city"
```

### Task 4: Vector and BG/CELL Register Districts

**Files:**
- Create: `packages/scene-modules/src/vector/VectorDistrict.tsx`
- Create: `packages/scene-modules/src/cell/CellDistrict.tsx`
- Create: `packages/scene-modules/src/cell/CellBanks.tsx`
- Create: `packages/scene-modules/src/cell/Crossbar.tsx`
- Create: `packages/scene-modules/src/cell/cell-mapping.ts`
- Test: `packages/scene-modules/src/cell/cell-mapping.test.ts`
- Test: `packages/scene-modules/src/cell/cell-instances.test.tsx`

**Interfaces:**
- Produces: 8192 CELL instances and 16 crossbar output-lane entities.
- Mapping: `instanceId = pe*2048 + bank*256 + row`; `physCellId = row*8 + bank`.

- [ ] **Step 1: Write failing mapping tests**

Test first/last CELL, `PE2/B5/R23`, byte ranges, four-bank group selection, and four equal PE quarter bounds.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/scene-modules/src/cell`

Expected: FAIL.

- [ ] **Step 3: Implement four flattened CELL planes**

Within every bank, fold 256 rows into 32 columns × 8 visual rows. Keep every CELL independently pickable. Render thin bank rails and per-bank occupancy/conflict edges.

- [ ] **Step 4: Implement 8→4 Crossbar and Vector slices**

Crossbar selects `{B0–B3}` or `{B4–B7}` and exposes four 128B lanes at the CUBE boundary. Vector has four aligned slices with VRF/FMLA/ALU/Reduce sub-buildings.

- [ ] **Step 5: Test and commit**

```bash
npx vitest run packages/scene-modules/src/cell
git add packages/scene-modules/src/cell packages/scene-modules/src/vector
git commit -m "feat: render vector and physical CELL banks"
```

### Task 5: CUBE/GMMA and StgBufB

**Files:**
- Create: `packages/scene-modules/src/cube/CubeDistrict.tsx`
- Create: `packages/scene-modules/src/cube/CubePeStrip.tsx`
- Create: `packages/scene-modules/src/cube/CubeMacCells.tsx`
- Create: `packages/scene-modules/src/cube/StgBufB.tsx`
- Create: `packages/scene-modules/src/cube/cube-mapping.ts`
- Test: `packages/scene-modules/src/cube/cube-layout.test.ts`
- Test: `packages/scene-modules/src/cube/cube-instances.test.tsx`

**Interfaces:**
- Produces: 256 visible MAC cells (`4 PE × 4 N × 16 M`) and 64 StgBufB SsbID instances.
- Encodes K16 in metadata, not as invented routing.

- [ ] **Step 1: Write failing topology tests**

Assert PE strip alignment with CELL quarters, MAC mapping, StgBufB below matrix, A endpoints on the left, B columns vertical, and WQ_CUBE return endpoints on the left.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/scene-modules/src/cube`

Expected: FAIL.

- [ ] **Step 3: Implement CUBE matrix and buffers**

Each PE is a wide, shallow strip. Each visible MAC cell has metadata `{ pe, m, n, kDepth:16 }`. Place four CubeRdBuf slots per PE before the matrix and WQ_CUBE after the result path.

- [ ] **Step 4: Implement StgBufB and straight B broadcast**

Render 64 × 4KB subspaces below CUBE. Create 16 straight vertical pipes aligned to M columns. No Input/Output/Weight Buffer labels and no outerCube elements.

- [ ] **Step 5: Test and commit**

```bash
npx vitest run packages/scene-modules/src/cube
git add packages/scene-modules/src/cube
git commit -m "feat: render BG StgBufB GMMA topology"
```

### Task 6: TLSU, City Composition, and Data Tokens

**Files:**
- Create: `packages/scene-modules/src/tlsu/TlsuDistrict.tsx`
- Create: `packages/scene-modules/src/flow/DataTokenLayer.tsx`
- Create: `packages/scene-modules/src/flow/orthogonal-route.ts`
- Create: `packages/scene-modules/src/City.tsx`
- Create: `apps/viewer/src/scene/SceneViewport.tsx`
- Modify: `apps/viewer/src/app/App.tsx`
- Test: `packages/scene-modules/src/flow/orthogonal-route.test.ts`
- Test: `apps/viewer/src/scene/SceneViewport.test.tsx`

**Interfaces:**
- Replaces the Plan 2 placeholder without changing `SceneViewportProps`.
- Data token input is `ActiveEvent[]`; route output is straight segments and normalized progress.

- [ ] **Step 1: Write failing composition and route tests**

Assert TLSU modules, no direct TLSU→MAC edge, every route segment changes one axis only, A token x increases, and B token z traverses all PE strips.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/scene-modules/src/flow apps/viewer/src/scene`

Expected: FAIL.

- [ ] **Step 3: Implement TLSU and complete city composition**

Render TLSU/AGU, LDQ/STQ, MTE/GMMA.LD, L2/Streaming, and SFU/Layout. Compose all districts under one R3F Canvas and one frame loop.

- [ ] **Step 4: Implement event-driven data tokens**

Create token instances only for active `pipe.transfer`, `cell.read/write`, and CUBE flow events. Interpolate along orthogonal routes; remove tokens when event duration ends.

- [ ] **Step 5: Test and commit**

```bash
npx vitest run packages/scene-modules/src/flow apps/viewer/src/scene
git add packages/scene-modules/src/tlsu packages/scene-modules/src/flow packages/scene-modules/src/City.tsx apps/viewer/src
git commit -m "feat: compose trace-driven LinxSimCity"
```

### Task 7: Visual Regression, Responsive Layout, and Performance

**Files:**
- Create: `tests/visual/city.spec.ts`
- Create: `tests/visual/scalar.spec.ts`
- Create: `tests/visual/cell.spec.ts`
- Create: `tests/visual/cube.spec.ts`
- Create: `tests/visual/baselines/`
- Create: `tests/performance/scene-benchmark.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes the Plan 1 synthetic trace and full city.
- Produces screenshot baselines at 736×900 and 360×800 plus performance report.

- [ ] **Step 1: Write failing visual and scene performance tests**

Check focus buttons, hover/click identity, Cache/CELL/ROB highlight, Demo/Expert, no horizontal overflow, no console warnings, and 60 FPS target after warmup on the synthetic trace.

- [ ] **Step 2: Run to capture intended failures**

Run: `npx playwright test tests/visual tests/performance/scene-benchmark.spec.ts`

Expected: FAIL until baselines and final responsive CSS exist.

- [ ] **Step 3: Tune only permitted internal placement**

Adjust module offsets, label scale, pipe anchor points, camera presets, and LOD thresholds. Do not change district order, PE alignment, A/B direction, or StgBufB location.

- [ ] **Step 4: Run all Plan 3 gates**

```bash
npm run check
npm run build -w @linxsimcity/viewer
npx playwright test tests/e2e tests/visual tests/performance/scene-benchmark.spec.ts
```

Expected: all PASS; 736px and 360px have zero horizontal overflow and no console errors.

- [ ] **Step 5: Commit and push**

```bash
git add tests/visual tests/performance playwright.config.ts .github/workflows/ci.yml README.md
git commit -m "test: lock physical city visuals and performance"
git push origin main
```

## Plan 3 Completion Gate

- Full physical city replaces the placeholder and is trace-driven.
- Counts are exact: 8192 CELLs, 1024 L1I, 1024 L1D, 128 ROB, 256 visible MAC, 64 StgBufB.
- Picking maps physical instances to stable entity IDs.
- A is horizontal, B is vertical, and pipes are orthogonal 3D geometry.
- Visual and performance tests pass at desktop and narrow widths.

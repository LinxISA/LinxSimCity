# LinxSimCity PipeView Stage City Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a collision-free rectangular Linx core whose macro districts retain the current floor plan while every SuperScalarModel PipeView stage is a topology-placed building connected by an orthogonal pipe.

**Architecture:** A deterministic topology enrichment library upgrades the bundled FA topology with the approved district rectangles, stage modules, stage pipes, four PE bays, and Shared Tile Register cells. The renderer consumes only the resulting topology placement and route data when the `pipeview-stage-city-v1` capability is present; old traces retain their compatibility layout. Pure collision utilities and asset contract tests reject overlaps before the viewer build.

**Tech Stack:** TypeScript 5.9, React 19, Three.js 0.185, React Three Fiber 9, Node.js ESM scripts, Vitest 4.

## Global Constraints

- Work only in `/Users/zhoubot/Documents/LinxSimCity/.worktrees/implementation`; do not edit `main` directly.
- Use TDD for every behavior change and observe the expected RED before production edits.
- Run Vitest with `--maxWorkers=1` for changed suites and at most `--maxWorkers=2` for the final repository test run.
- Run heavy verification gates sequentially to avoid a repeat of the prior memory exhaustion.
- Do not add dependencies, enable scene-wide Bloom, or add per-cell/per-token lights.
- The Core footprint is rectangular with aspect ratio between `1.8:1` and `2.1:1`.
- Display the legacy StgBufB hardware as `Shared Tile Register`; use canonical ID `shared_tile_register` and compatibility alias `stgbufb`.
- Shared Tile Register contains 2048 individually selectable 128-byte cells.
- Physical placement and route points come from topology; hard-coded geometry is fallback-only for traces without physical layout.
- Do not fabricate missing SuperScalarModel stage events. Static buildings may remain inactive.

---

### Task 1: Add Deterministic Layout Collision Validation

**Files:**
- Create: `packages/topology/src/layout-collision.ts`
- Create: `packages/topology/src/layout-collision.test.ts`
- Modify: `packages/topology/src/index.ts`

**Interfaces:**
- Produces `LayoutCollisionKind = "district-overlap" | "entity-overlap" | "pipe-building-crossing"`.
- Produces `LayoutCollision { kind, firstId, secondId, message }`.
- Produces `findLayoutCollisions(topology: TopologyDescriptor): readonly LayoutCollision[]`.
- Consumes topology placements and orthogonal routes without allocating a pairwise matrix.

- [ ] **Step 1: Write failing district and entity overlap tests**

Create fixtures with two X/Z-overlapping districts, two sibling solid modules with overlapping placements, touching-but-not-overlapping boxes, nested parent/child geometry, and entities in separate districts. Assert only real sibling overlaps are returned.

```ts
expect(findLayoutCollisions(overlappingTopology)).toEqual([
  expect.objectContaining({
    kind: "district-overlap",
    firstId: "scalar",
    secondId: "vector",
  }),
]);
expect(findLayoutCollisions(touchingTopology)).toEqual([]);
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run packages/topology/src/layout-collision.test.ts --maxWorkers=1`

Expected: FAIL because `layout-collision.ts` does not exist.

- [ ] **Step 3: Implement sweep-sorted X/Z collision checks**

Represent each district or solid sibling entity as:

```ts
interface Bounds2 {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}
```

Sort by `minX`, stop comparing when the next `minX >= current.maxX`, and require positive overlap on both axes. Treat entities as collision solids when `kind === "module"` and `attributes?.collisionRole !== "container"`. Compare entities only when `parentId` and `placement.district` both match.

- [ ] **Step 4: Add RED/GREEN pipe crossing coverage**

Test a route segment that crosses an unrelated module and a route that ends at that module's declared port. Implement slab intersection in X/Z and ignore the first/last target endpoint. Do not compare pipes with CELL, MAC, register, cache-line, or subspace instances.

- [ ] **Step 5: Verify Task 1 and commit**

Run:

```sh
npx vitest run packages/topology/src/layout-collision.test.ts --maxWorkers=1
npm run typecheck --workspace @linxsimcity/topology
git add packages/topology/src
git commit -m "feat: validate physical city collisions"
```

Expected: all PASS and one focused commit.

---

### Task 2: Generate the PipeView Stage Topology Overlay

**Files:**
- Create: `scripts/lib/pipeview-stage-city.mjs`
- Create: `tests/showcase/pipeview-stage-city.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `PIPEVIEW_STAGE_DOMAINS`, an immutable inventory for scalar, scalar-memory, vector, cube, acccvt, tlsu, and tile-bridge stages.
- Produces `enrichPipeviewStageCity(topology): TopologyDescriptor` without mutating its input.
- Produces CLI script `npm run showcase:stage-city -- --trace-dir <directory>` in Task 3.
- Adds stage modules with `attributes.visualRole === "pipeview-stage"` and stage pipes with `attributes.visualRole === "pipeview-pipe"`.

- [ ] **Step 1: Write failing stage inventory tests**

Assert exact ordered stage arrays:

```js
scalar: ["F0", "F1", "F2", "F3", "F4", "F5", "D0", "D1", "D2", "D3", "S1", "IQ", "RD", "P1", "I1", "I2", "E0", "E1", "E2", "E3", "E4", "E5", "W1", "W2", "CM", "R"]
vector: ["F", "S", "P", "I", "E1", "E2", "E3", "E4", "E5", "W1", "W2", "CM"]
cube: ["Issue", "Rename", "GenLoad", "Wait", "SrcAReady", "SrcBReady", "SrcCReady", "RdBuffer", "Ctrl", "Calc", "L0CWr", "Commit"]
acccvt: ["Start", "Rename", "Issue", "Arb", "Wait", "SrcReady", "SrcData", "FixPipe"]
tlsu: ["Start", "ToScalper", "ToTile", "GenPreReq", "MemoryReq", "PreDataRet", "FromScalper", "GenLoadReq", "TileReadReq", "TileDataRet", "LoadDataRet", "Commit"]
tileBridge: ["Start", "WaitB", "GenR", "Tag", "WaitR", "GenW", "WaitW", "Integ", "Ready", "TXed", "Bus", "DBID", "Ret", "Comp"]
```

Also assert the scalar-memory branch contains `LSU-E1`, `LDQ`, `LQP`, `LQI`, `L1M`, `L2M`, `MR`, `L2R`, `L1R`, and `LR`.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/showcase/pipeview-stage-city.test.ts --maxWorkers=1`

Expected: FAIL because the enrichment library does not exist.

- [ ] **Step 3: Implement the approved district rectangles and stage packer**

Use the exact Core rectangle and district coordinates from the design spec. Implement a deterministic snake-grid packer:

```js
export function packStageBuildings({ district, stages, columns, padding, rowGap, columnGap }) {
  // returns one centered placement per ordered stage and reverses odd rows
}
```

Give every stage module four PE bays through `attributes.peBays = 4`. Add one input and one output port on each module. Connect consecutive stages with orthogonal routes that remain inside the district road corridors.

- [ ] **Step 4: Add CUBE, branch, and Shared Tile Register topology**

Make `cube.Calc` a container-sized stage building with the existing four PE matrix rows nested inside it. Add sixteen horizontal A routes (four bank lanes for each of four PE rows) and four vertical B broadcast routes. Create `shared_tile_register` plus 2048 `cell` children arranged as 64 SsbID groups times 32 128-byte cells, preserving `stgbufb` in `attributes.compatibilityAlias`.

Relocate existing BG/CELL and CUBE MAC placements into their new districts using normalized coordinates. Do not change event entity IDs.

- [ ] **Step 5: Validate the enriched topology and commit**

In the test, call both `validateTopology(enriched)` and `findLayoutCollisions(enriched)`. Assert zero errors/collisions, Core aspect ratio `1.875`, 2048 Shared Tile Register cells, sixteen A routes, four B routes, and one module for every stage inventory entry.

Run:

```sh
npx vitest run tests/showcase/pipeview-stage-city.test.ts --maxWorkers=1
npm run typecheck
git add scripts/lib/pipeview-stage-city.mjs tests/showcase/pipeview-stage-city.test.ts package.json
git commit -m "feat: define pipeview stage city topology"
```

Expected: PASS.

---

### Task 3: Enrich and Repack the Bundled FA Trace

**Files:**
- Create: `scripts/enrich-pipeview-stage-city.mjs`
- Modify: `apps/viewer/public/traces/supernpubench-fa-250-blocks/topology.json` by running the script
- Modify: `apps/viewer/public/traces/supernpubench-fa-250-blocks/manifest.json` by running the script
- Modify: `apps/viewer/public/traces/supernpubench-fa-250-blocks.linxtrace` by running the existing CLI pack command
- Modify: `tests/showcase/default-fa-asset.test.ts`

**Interfaces:**
- CLI accepts exactly `--trace-dir PATH` and refuses to overwrite a topology that already declares `pipeview-stage-city-v1` unless `--force` is present.
- Writes topology atomically through a same-directory temporary file and rename.
- Adds manifest capability `pipeview-stage-city-v1` without changing event counts or cycle bounds.

- [ ] **Step 1: Write failing CLI and asset contract tests**

Use a temporary trace directory to assert argument validation, idempotence refusal, atomic output, capability insertion, stage entity counts, Shared Tile Register cell count, and unchanged manifest event metadata.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/showcase/pipeview-stage-city.test.ts tests/showcase/default-fa-asset.test.ts --maxWorkers=1`

Expected: FAIL because the bundled asset has no stage-city capability or stage entities.

- [ ] **Step 3: Implement the atomic CLI and enrich the directory asset**

Run:

```sh
node scripts/enrich-pipeview-stage-city.mjs \
  --trace-dir apps/viewer/public/traces/supernpubench-fa-250-blocks
```

Format the generated JSON with the script's stable two-space serializer. Do not load chunk event files.

- [ ] **Step 4: Repack the downloadable archive**

Build the CLI, pack to a temporary archive outside the source directory, then replace the tracked archive with a filesystem rename:

```sh
npm run build --workspace @linxsimcity/linxtrace
tmp_archive="$(mktemp -t linxsimcity-fa-stage-city).linxtrace"
node tools/linxtrace/dist/main.js pack \
  apps/viewer/public/traces/supernpubench-fa-250-blocks \
  "$tmp_archive"
mv "$tmp_archive" apps/viewer/public/traces/supernpubench-fa-250-blocks.linxtrace
node tools/linxtrace/dist/main.js validate \
  apps/viewer/public/traces/supernpubench-fa-250-blocks.linxtrace
```

- [ ] **Step 5: Verify asset contracts and commit**

Run:

```sh
npx vitest run tests/showcase/pipeview-stage-city.test.ts tests/showcase/default-fa-asset.test.ts --maxWorkers=1
git add scripts/enrich-pipeview-stage-city.mjs apps/viewer/public/traces tests/showcase/default-fa-asset.test.ts
git commit -m "feat: publish pipeview stage city trace topology"
```

Expected: PASS; the archive and logical directory agree.

---

### Task 4: Render All Districts from Authoritative Topology

**Files:**
- Modify: `packages/scene-modules/src/common/DistrictFrame.tsx`
- Create: `packages/scene-modules/src/topology/district.ts`
- Create: `packages/scene-modules/src/topology/district.test.ts`
- Modify: `packages/scene-modules/src/City.tsx`
- Modify: `packages/scene-modules/src/cell/CellDistrict.tsx`
- Modify: `packages/scene-modules/src/cube/CubeDistrict.tsx`
- Modify: `packages/scene-modules/src/cube/CubeMacCells.tsx`
- Rename: `packages/scene-modules/src/cube/StgBufB.tsx` to `packages/scene-modules/src/cube/SharedTileRegister.tsx`
- Modify: `packages/scene-modules/src/vector/VectorDistrict.tsx`
- Modify: `packages/scene-modules/src/tlsu/TlsuDistrict.tsx`

**Interfaces:**
- Produces `districtRect(topology, id): { center, size } | undefined`.
- `DistrictFrame` accepts center/size vectors rather than legacy lower-left coordinates.
- CUBE MACs and Shared Tile Register cells use `entityToBox` and no fixed positions when matching topology entities exist.

- [ ] **Step 1: Write failing topology-first rendering tests**

Assert district rectangles copy topology coordinates exactly, CUBE MAC instances use supplied placements, Shared Tile Register selects canonical and compatibility IDs, and no topology-present code path calls `resolveLayout`.

- [ ] **Step 2: Run RED**

Run: `npx vitest run packages/scene-modules/src/topology packages/scene-modules/src/cube packages/scene-modules/src/cell --maxWorkers=1`

Expected: FAIL because CUBE, Vector, district frames, and Shared Tile Register still use fixed geometry.

- [ ] **Step 3: Convert district frames and dense arrays**

Pass `topology` into every district. Render district ground from `topology.layout.districts`. Map physical MAC/CELL/subspace entities with `entityToBox`. Keep each component's existing legacy geometry only when no matching physical placement is present.

- [ ] **Step 4: Remove duplicate legacy pipes under the stage-city capability**

When topology has `pipeview-stage-city-v1`, render topology pipe entities once in `City`. Disable `StraightPipe` copies in CUBE, Vector, and TLSU. Preserve old behavior for traces without the capability.

- [ ] **Step 5: Verify Task 4 and commit**

Run:

```sh
npx vitest run packages/scene-modules/src --maxWorkers=1
npm run typecheck
git add packages/scene-modules/src
git commit -m "fix: render city geometry from trace topology"
```

Expected: PASS.

---

### Task 5: Render Stage Buildings, PE Bays, and Active Pipes

**Files:**
- Create: `packages/scene-modules/src/stages/stage-entities.ts`
- Create: `packages/scene-modules/src/stages/stage-entities.test.ts`
- Create: `packages/scene-modules/src/stages/StageBuilding.tsx`
- Create: `packages/scene-modules/src/stages/StageCity.tsx`
- Modify: `packages/scene-modules/src/City.tsx`
- Modify: `packages/scene-modules/src/topology/RoutePipe.tsx`
- Modify: `packages/scene-modules/src/index.ts`

**Interfaces:**
- Produces `pipeviewStages(topology)` and `pipeviewPipes(topology)` by topology attributes.
- Produces `activeStageBays(snapshot, stageEntity): readonly boolean[]` using authoritative `stage_id` and `thread_id` only.
- `StageBuilding` renders one solid building and four narrow PE bay meshes with the existing thread palette.
- `RoutePipe` accepts `active?: boolean` and changes emissive intensity without replacing geometry/material each frame.

- [ ] **Step 1: Write failing stage selection and bay activation tests**

Cover exact domain/stage matching, case-normalized aliases (`ReName`/`Rename`, `srcAready`/`SrcAReady`), absent stage events, invalid thread IDs, and simultaneous PE0/PE3 occupancy.

- [ ] **Step 2: Run RED**

Run: `npx vitest run packages/scene-modules/src/stages --maxWorkers=1`

Expected: FAIL because stage entity selectors do not exist.

- [ ] **Step 3: Implement stage buildings and LOD-safe labels**

Render the topology module box, then four inset bay boxes at the facade. Use `threadColor(pe)` for active bays and a dimmed district color for inactive bays. Reuse geometries/materials per domain and do not create HTML labels for Shared Tile Register cells.

- [ ] **Step 4: Activate physical stage pipes**

Mark a stage pipe active only when an active event references its entity ID/route ID or when its declared destination stage matches the event's authoritative domain/stage/thread fields. Keep inactive pipes visible at 20% intensity.

- [ ] **Step 5: Verify Task 5 and commit**

Run:

```sh
npx vitest run packages/scene-modules/src/stages packages/scene-modules/src/flow packages/scene-modules/src/topology --maxWorkers=1
npm run typecheck
git add packages/scene-modules/src
git commit -m "feat: render pipeview stage buildings and routes"
```

Expected: PASS.

---

### Task 6: Build and Visually Verify the City Preview

**Files:**
- Modify only if verification exposes a tested defect: files from Tasks 2-5
- Create: `docs/superpowers/reports/2026-08-14-pipeview-stage-city-preview.md`

**Interfaces:**
- Production build at `apps/viewer/dist`.
- Local preview served without writing outside the worktree.
- Report records counts, collision result, screenshots, command evidence, and remaining model-event gaps.

- [ ] **Step 1: Run bounded repository verification sequentially**

Run:

```sh
npx vitest run packages/topology/src packages/scene-modules/src tests/showcase --maxWorkers=1
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run pages:verify
```

Expected: all PASS. Do not run these commands concurrently.

- [ ] **Step 2: Start the local production preview**

Run the repository's existing static-server command on an unused localhost port. Record its PID and terminate it after screenshots are captured.

- [ ] **Step 3: Inspect the complete Core and close views**

Verify in the browser:

- the full floor is rectangular;
- Scalar, Vector, BG/CELL, CUBE, TLSU, and Shared Tile Register plots do not overlap;
- stage buildings remain within their parent plots;
- CUBE PE rows align with BG/CELL rows;
- all sixteen A pipes are horizontal and all four B pipes are vertical;
- Shared Tile Register is directly beneath CUBE and labeled correctly;
- pan, orbit, zoom, arrow keys, and PE selection still work;
- no WebGL errors or runaway memory growth occur during default playback.

- [ ] **Step 4: Fix only evidence-backed visual defects with RED tests first**

For each defect, add the smallest deterministic layout or selector test, observe RED, change the responsible pure geometry/selector function, and rerun the focused suite before refreshing the browser.

- [ ] **Step 5: Write the report, run final gates, and commit**

Run:

```sh
npm test -- --maxWorkers=2
npm run typecheck
npm run lint
npm run format:check
npm run build
git diff --check
```

Write the exact results and any stages lacking emitted model events to the report, then commit:

```sh
git add docs/superpowers/reports/2026-08-14-pipeview-stage-city-preview.md
git commit -m "docs: record pipeview stage city preview"
```

Expected: clean worktree, all gates PASS, and a locally inspectable preview.

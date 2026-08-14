# LinxSimCity PipeView Stage City Design

**Status:** Approved

**Date:** 2026-08-14

**Repositories:** `LinxISA/LinxSimCity`, `LinxISA/SuperScalarModel`

## 1. Goal

Render the complete Linx core as one rectangular WebGL city whose macro floor plan remains recognizable while every SuperScalarModel PipeView stage is a visible building connected by physical pipes.

The first deliverable is a static and trace-reactive city preview. It must fix the current CUBE/BG/TLSU overlap, expose stage buildings and routes in the bundled FlashAttention topology, and remain compatible with the events already present in that trace. A later SuperScalarModel integration may emit the remaining stage transitions, but the Viewer must not invent transitions that are absent from the trace.

## 2. Confirmed Product Decisions

1. The complete Core is one rectangle. Its size may grow, but its width-to-depth ratio stays between `1.8:1` and `2.1:1`.
2. The macro district order remains `Scalar -> Vector -> BG/CELL -> CUBE`, with `TLSU` below the left three districts and `Shared Tile Register` directly below CUBE.
3. Every PipeView stage is a building. This includes waits, arbitration, cache miss, memory return, and response stages.
4. Buildings are nested inside larger district plots. Stage detail does not replace the macro floor plan.
5. Every connection between stage buildings is a visible orthogonal pipe. Pipes use reserved corridors and do not cross building bounds.
6. `StgBufB` is displayed as `Shared Tile Register`. The new canonical topology ID is `shared_tile_register`; the legacy ID `stgbufb` remains a compatibility alias.
7. `Shared Tile Register` is `256KB`, is visualized as 2048 individually addressable 128-byte cells, and feeds CUBE B operands vertically.
8. PE-local storage is labeled `BG / CELL Register Banks`. A operands travel horizontally from four bank groups into the corresponding CUBE PE strip.
9. The four PE-threads share one visible L1I and one visible L1D. Each stage building contains four PE bays rather than duplicating the complete district four times.
10. Thread identity remains visible through stable PE colors. Stage occupancy, miss, return, flush, and terminal effects do not replace the thread color.
11. The page remains a borderless full-screen WebGL canvas. Districts are separated with ground material, roads, and height, not panel chrome.
12. Physical stage placement and pipe routes are stored in the trace topology. The Viewer consumes them without rearranging them.

## 3. Coordinate and Collision Contract

The preview uses a `240 x 128` scene-unit Core footprint centered at the origin. Its aspect ratio is `1.875:1`.

The initial district rectangles are:

| District | X range | Z range | Purpose |
|---|---:|---:|---|
| Scalar | `-116..-71` | `-58..34` | frontend, issue, execution, ROB, PRF, shared caches |
| Vector | `-68..-33` | `-58..34` | vector stages and execution submodules |
| BG/CELL | `-30..25` | `-58..34` | four PE rows, eight banks per PE, 128B cells |
| CUBE | `28..116` | `-58..34` | four aligned PE strips, CUBE and ACCCVT stages |
| TLSU | `-116..25` | `38..60` | scalar memory, tile bridge, MTE, L2/GM stages |
| Shared Tile Register | `28..116` | `38..60` | shared B storage and vertical broadcast source |

There is a minimum three-unit road gap between sibling districts. Entity bounding boxes must remain inside their district. Non-pipe sibling entities may not overlap in the X/Z plane. Pipes may leave a district only through declared ports and may intersect buildings only at their first or final route point.

The topology validation surface must report:

- overlapping sibling districts;
- overlapping non-pipe entities in the same district;
- a pipe segment entering an unrelated building;
- an entity outside its parent district;
- a non-orthogonal route.

The bundled FA topology must pass all of these checks.

## 4. Stage Building Inventory

### 4.1 Scalar

The scalar main path is:

```text
F0 -> F1 -> F2 -> F3 -> F4 -> F5 -> D0 -> D1 -> D2 -> D3
   -> S1 -> IQ -> RD -> P1 -> I1 -> I2
   -> E0 -> E1 -> E2 -> E3 -> E4 -> E5
   -> W1 -> W2 -> CM -> R
```

The load/store branch is:

```text
LSU-E1 -> LDQ -> LQP -> LQI -> L1M -> L2M -> MR
       -> L2R -> L1R -> LR
```

F1 connects to the shared L1I. L1M and L2M are explicit occupancy buildings and connect to the shared L1D/L2 path. ROB, PRF, IQ slots, and cache lines remain detailed physical structures inside the Scalar district.

### 4.2 Vector

The vector path is:

```text
F -> S -> P -> I -> E1 -> E2 -> E3 -> E4 -> E5 -> W1 -> W2 -> CM
```

Execution stage buildings may contain VRF, FMLA, ALU, and Reduce facade details, but the stage building is the trace-addressable entity.

### 4.3 CUBE and ACCCVT

The CUBE path is:

```text
Issue -> Rename -> GenLoad -> Wait
      -> SrcAReady -> SrcBReady -> SrcCReady
      -> RdBuffer -> Ctrl -> Calc -> L0CWr -> Commit
```

`Calc` is the large matrix building containing four horizontal PE strips. Each strip exposes a `16M x 4N x K16` visual grid. The four strips align with the four BG/CELL PE rows. `SrcAReady` receives horizontal A pipes from BG/CELL; `SrcBReady` receives vertical broadcast pipes from Shared Tile Register.

The ACCCVT side path is:

```text
Start -> Rename -> Issue -> Arb -> Wait -> SrcReady -> SrcData -> FixPipe
```

### 4.4 TLSU, Tile, and Bridge

The MTC/TLS path is:

```text
Start -> ToScalper -> ToTile -> GenPreReq -> MemoryReq
      -> PreDataRet -> FromScalper -> GenLoadReq -> TileReadReq
      -> TileDataRet -> LoadDataRet -> Commit
```

The detailed Tile Bridge path is:

```text
Start -> WaitB -> GenR -> Tag -> WaitR -> GenW -> WaitW
      -> Integ -> Ready -> TXed -> Bus -> DBID -> Ret -> Comp
```

These buildings live within the TLSU district. Shared L1D, L2, and global-memory endpoints are landmarks with individually traceable line/request detail.

## 5. Topology Representation

A stage building is a normal topology `module` entity with the following attributes:

```json
{
  "visualRole": "pipeview-stage",
  "stageDomain": "scalar",
  "stageId": "F1",
  "stageOrder": 1,
  "peBays": 4
}
```

Stage pipes are normal topology `pipe` entities. They contain physical orthogonal route points and the attributes `visualRole: "pipeview-pipe"`, `stageDomain`, `fromStage`, and `toStage`.

The bundled FA trace receives these entities directly in `topology.json`. Compatibility aliases are expressed as entity attributes rather than duplicate overlapping modules.

## 6. Rendering Rules

1. `DistrictFrame`, CUBE matrices, BG/CELL arrays, Shared Tile Register, Vector, and TLSU all read topology placement. Hard-coded coordinates are fallback-only for traces without `layout`.
2. A stage building shows four narrow PE bays. Inactive bays use the district base color; active bays use the stable thread color.
3. All stage pipes remain visible at low intensity. A matching `pipeline.enter`, `pipeline.leave`, or lifecycle event raises pipe emissive intensity and carries the instruction token along the route.
4. Long waits accumulate tokens inside the corresponding wait building. Tokens do not continue moving until the trace reports the next transition.
5. Cache miss and return stages pulse their building and exact cache line. Squash/flush produces the terminal burst at the last authoritative physical position.
6. Labels are LOD-aware. District names remain visible at city view; stage labels appear when the camera approaches the district; CELL and MAC labels appear only at close range.
7. Dense CELL and MAC meshes use instancing and do not cast per-instance shadows. No scene-wide bloom or per-token lights are introduced.

## 7. Preview Asset and Compatibility

The first preview enriches the bundled FA logical trace topology and matching downloadable archive. It does not alter event cycles or fabricate missing PipeView transitions.

Existing events are mapped only when their payload already carries a real `stage_id` or physical entity. Buildings without matching events remain visible but inactive. The topology declares a `pipeview-stage-city-v1` capability so the Viewer can select the new renderer while old traces continue through the compatibility path.

## 8. Acceptance Criteria

1. The public/default city is a rectangle with no district, building, or CUBE/BG/Shared Tile Register collision.
2. Macro district placement remains recognizable and follows the confirmed order.
3. Every listed Scalar, Vector, CUBE, ACCCVT, TLSU, and Tile Bridge stage has one visible building.
4. Every consecutive stage transition has a topology pipe.
5. CUBE A pipes are horizontal and B broadcast pipes are vertical.
6. Shared Tile Register is labeled exactly `Shared Tile Register`, contains 2048 selectable 128B cells, and is aligned beneath CUBE.
7. Stage buildings display four PE bays and use the existing thread color palette.
8. The bundled topology passes deterministic collision and orthogonal-route validation.
9. The Viewer loads the existing trace under the current memory budget and keeps dense meshes instanced.
10. A local production build renders the preview without WebGL errors, and the full repository test/typecheck/lint/format/build gates pass sequentially.

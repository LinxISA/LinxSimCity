# LinxSimCity Instruction-Level Trace City Design

**Status:** Approved
**Date:** 2026-08-13  
**Repositories:** `LinxISA/LinxSimCity`, `LinxISA/SuperScalarModel`

## 1. Goal

Upgrade LinxSimCity from module-level activity visualization to an instruction-level, causally linked, seekable microarchitecture trace city.

The public FlashAttention demo must expose the real scalar instruction path, ROB lifecycle, physical-register reads and writes, shared instruction/data cache-line traffic, exact 128-byte Tile Register CELL accesses, and detailed TLSU request/response flow. The Viewer must render facts emitted by SuperScalarModel rather than infer hidden hardware behavior.

The visual language may borrow the event-replay, stable-token, ROB-ring, PRF-grid, and cache-line-grid ideas demonstrated by Gem5SimCity. LinxSimCity will not copy Gem5SimCity source code or gem5-specific hook implementations.

## 2. Non-negotiable Architecture Decisions

1. The trace is authoritative. The Viewer does not guess ROB slots, physical registers, cache ways, CELL rows, issue ports, or pipe routes.
2. The public demo uses a complete detailed trace. Large traces are delivered as remote logical bundles with chunked, on-demand loading.
3. The scalar detail view shows one selected PE-thread at readable scale. `1` through `4` switch PE0 through PE3.
4. Instruction token body color permanently identifies its thread. Hardware state is shown with outlines, pulses, brightness, and pipe effects instead of replacing the thread color.
5. The four PE-threads share one visual and trace topology for I-Cache and one for D-Cache. Each access retains its source `thread_id`, so concurrent accesses can show four independent colored beams on one cache line.
6. The Tile Register has four PE-local quarters. Each quarter contains eight banks, each bank contains 256 physical CELL rows, and each CELL is 128 bytes. The complete city therefore contains 8192 addressable Tile Register CELL instances.
7. Physical city placement and pipe geometry are part of `topology.json`. The Viewer may apply whole-scene transforms and LOD, but must not silently rearrange authoritative entity placement.
8. All primary data paths use straight orthogonal pipes. A flows horizontally into CUBE; B broadcasts vertically from StgBufB below CUBE.
9. The page is a full-screen WebGL canvas. Trace information is displayed as borderless HUD text over the scene, not inside permanent panels.

## 3. Evidence and Source Boundaries

### 3.1 SuperScalarModel

The detailed trace must be emitted at existing authoritative state transitions:

- `TimingSim/common/ModelCommon/CycleInfo.h`: scalar, memory, CUBE, bridge, tload, and tstore stage timestamps.
- `TimingSim/isa/SimInstInfo.{h,cpp}`: instruction IDs, PE/thread IDs, ROB IDs, physical sources and destinations, IQ name, load/store IDs, memory address and size, and cross-cache-line state.
- `TimingSim/trace/InstTracer.{h,cpp}`: existing scalar, CUBE, and memory stage serialization.
- `TimingSim/frontend/rob/SPEROB.cpp` and Tile ROB implementation: allocation, issue, completion, flush, and retirement.
- `TimingSim/scalar_pe/lsu/l1/`: cache lookup, refill, replacement, SCB, and return paths.
- `TimingSim/pe/cell/CellReg.cpp`: bank split, arbitration, grant/conflict, and actual bank service.
- `TimingSim/group/tlsu/tile_lsu.cpp`: BridgePairQ and tile/global-memory request stages.
- `modelSpec/cell_register_as.md`: 128-byte CELL, eight banks, 256 physical rows per bank, and per-source queue/arbitration semantics.

No independent local LinxCoreModel implementation is available for this work. SuperScalarModel is the timing and trace source of truth. DavinciOO is only a top-level structural reference and must not replace SuperScalarModel details.

### 3.2 Gem5SimCity

The following concepts are adapted, not copied:

- event-sourced structure reconstruction for seek;
- one stable token for an instruction lifecycle;
- semantic ROB ring states and pointers;
- exact PRF and cache-line cell highlighting;
- execution route selection from real issue/FU metadata.

The gem5 patch, hard-coded cache geometry, sequence-number modulo slot mapping, and gem5-specific state structures are not reusable contracts for Linx.

## 4. Trace Bundle and Delivery

### 4.1 Remote logical bundle

The public demo is published as independently fetchable files:

```text
traces/fa-detail/
├── manifest.json
├── topology.json
├── strings.json
├── index.json
├── checkpoints/
│   └── 000000000000.json.gz
└── chunks/
    ├── 000000.jsonl.gz
    ├── 000001.jsonl.gz
    └── ...
```

The Viewer loads metadata first and fetches only the checkpoint and chunks needed for the current cycle window. It prefetches a bounded number of adjacent chunks and preserves the existing memory limits and LRU behavior. Local `.linxtrace` ZIP archives remain supported.

### 4.2 Causal identifiers

Every instruction-related event carries:

- `instruction_id`: stable for the complete instruction lifetime;
- `thread_id`: `0..3`;
- `pc` and `disassembly_id`;
- `bid`, `rid`, and `rob_slot` when defined;
- `request_id` for associated memory, Tile, StgBufB, or cache activity;
- `route_id` for movement between physical scene ports.

IDs must be emitted by the model. They must not be synthesized from cycle order in the Viewer.

## 5. Physical Topology Contract

### 5.1 Coordinate space

`topology.json` declares a layout coordinate system:

```json
{
  "layout": {
    "schema": "linx-city-v1",
    "units": "scene-unit",
    "upAxis": "y",
    "forwardAxis": "-z",
    "districts": [
      {
        "id": "scalar",
        "position": [-62, 1, 0],
        "size": [12, 4, 8]
      }
    ]
  }
}
```

These coordinates define the stable LinxSimCity floorplan, not semiconductor place-and-route coordinates.

### 5.2 Entity placement

Every visible entity may carry:

```json
{
  "placement": {
    "district": "scalar",
    "thread": 0,
    "position": [-61.2, 0.4, -10.8],
    "size": [0.18, 0.45, 0.18],
    "rotation": [0, 0, 0],
    "row": 2,
    "column": 5,
    "lodGroup": "scalar-prf"
  }
}
```

Placement values must be finite. Sizes must be positive. Entity bounds must remain inside the declared district bounds unless the entity is an inter-district pipe.

### 5.3 Ports and routes

Ports have stable positions and direction metadata. A pipe references its source and destination ports and contains an orthogonal polyline:

```json
{
  "id": "pipe.scalar.int0",
  "kind": "pipe",
  "route": {
    "style": "orthogonal",
    "fromPortId": "pe0.issue.port1",
    "toPortId": "pe0.int0.input",
    "points": [[-63, 1, -4], [-60, 1, -4], [-60, 1, 1]]
  }
}
```

Each consecutive route segment must change exactly one coordinate. Runtime events reference the route entity and do not repeat points.

## 6. Detailed Event Contracts

### 6.1 Scalar instruction pipeline

An instruction token follows the actual path:

```text
Fetch → shared I$ → Decode → Rename → Dispatch → IQ
      → PRF read → selected issue port → selected execution pipe
      → Writeback → ROB ready → Commit
```

Pipeline events carry `instruction_id`, `thread_id`, `stage_id`, `route_id`, `rob_slot`, `iq_slot`, `issue_port`, `pipe_id`, and `fu_kind` as applicable.

Stall, replay, squash, and flush events carry structured reason codes. A flushed token visibly terminates and cannot later retire.

### 6.2 ROB

ROB events describe real slots and lifecycle transitions:

- allocate;
- issued;
- executing;
- complete;
- ready-to-retire;
- retire;
- flush or exception.

Head and tail are explicit state, not inferred from the most recent allocate/retire event. Each slot exposes PC, disassembly, instruction ID, thread, and dependency summary in the inspector/HUD.

### 6.3 Rename, PRF, and scoreboard

Required events:

- physical destination allocation and prior mapping;
- physical source dependencies;
- PRF read with consumer, port, and physical register list;
- PRF write with producer and writeback port;
- ready/not-ready transition;
- wakeup/bypass;
- physical-register free.

The physical register file is a flattened, individually pickable cell grid driven by topology capacity.

### 6.4 Shared I-Cache and D-Cache

Both caches are represented once for the four threads. Cache events carry:

- `cache_id`, level, operation, request ID, and instruction ID;
- virtual address when available;
- physical line address under the selected trace profile;
- line bytes, set, way, tag, and coherence/valid state;
- lookup, hit, miss, MSHR allocate/release, fill, eviction, write, and writeback stage;
- source thread and source port.

A cache line may receive multiple thread-colored access beams in one cycle. Its body state shows hit/miss/fill/evict/writeback independently of thread color.

Cross-line accesses produce one linked request with multiple line sub-accesses.

### 6.5 Tile Register CELL

The corrected topology is:

```text
4 PE × 8 banks × 256 rows × 128 bytes = 8192 physical CELL instances
```

CELL events carry `phys_cell_id`, PE, bank, row, byte offset, byte count, operation, source class, request ID, queue ID, port, arbitration state, wait cycles, and route ID.

Animation follows:

```text
request → per-bank queue → arbitration → grant/conflict
        → exact CELL read/write → response route
```

A conflict leaves the losing request at the bank entrance. Only the granted request enters and highlights the CELL.

### 6.6 StgBufB and CUBE

StgBufB remains below CUBE and is the shared tile register for B data. It is visualized by 64 SsbID subspaces and, at close LOD, by 128-byte cells within the selected subspace.

Required links include:

- `GMMA.LD`: global memory → MTE → StgBufB;
- `GMMA.MOV`: Tile CELL → StgBufB;
- A/C: PE-local CELL bank routes;
- B: vertical StgBufB broadcast;
- four horizontally split PE strips aligned with one Tile Register quarter each;
- MAC stage, accumulator, and writeback route.

### 6.7 TLSU

TLSU is expanded from static buildings into trace-driven stages:

```text
Issue → AGU → LDQ/STQ → split/coalesce → shared D$
      → L2/global memory → response buffer → PRF or Tile CELL writeback
```

Tile operations additionally expose BridgePairQ, read/write buffers, request counters, target CELL bank requests, and completion. Memory requests and responses retain the same `request_id` through every TLSU stage.

## 7. Runtime State and Seek

The runtime builds a causal graph and reconstructable structure state:

- instruction lifecycle by `instruction_id`;
- memory/TLSU lifecycle by `request_id`;
- ROB slot state and pointers;
- PRF allocation/readiness;
- cache-line state and MSHR occupancy;
- CELL queue/arbitration/state;
- active pipe transfers and their interpolation windows.

Forward playback applies sparse cycle deltas. Reverse seek and large jumps restore the nearest checkpoint and replay only the necessary chunks. Checkpoints include structure state but not transient GPU objects.

Unknown optional events remain forward-compatible. Required detailed fields fail validation with an actionable diagnostic instead of silently degrading to guessed animation.

## 8. Visual Semantics

### 8.1 Thread identity

The four PE-threads receive four stable, color-blind-distinguishable colors. An instruction retains its thread color from fetch through retirement.

Hardware state overlays:

- hit or ready: green outline/pulse;
- miss: red outline/pulse;
- stall or dependency pending: amber outline;
- flush or exception: magenta fragmentation/pulse;
- read: white flash;
- writeback: orange/red beam.

### 8.2 ROB, PRF, and Cache

ROB is a semantic ring with visible head and tail markers. PRF and shared caches are flattened instance grids. Clicking any instance locks the associated causal chain when an active event provides one.

### 8.3 Continuous tokens

Tokens interpolate along topology routes between event timestamps. They do not teleport between module centers. Instruction, memory request, vector operation, GMMA operation, and Tile request tokens are distinct shapes while preserving thread color where a thread owner exists.

## 9. Full-screen Interaction and HUD

The application removes the top bar, sidebar, persistent panels, and panel borders. The WebGL canvas fills the viewport.

### 9.1 Controls

- left mouse drag: orbit;
- right or middle mouse drag: pan;
- wheel: zoom;
- arrow keys: translate camera;
- `Shift+Left` and `Shift+Right`: previous/next cycle;
- Space: play/pause;
- `1` through `4`: select PE0 through PE3 scalar detail;
- `F`: follow the latest committed instruction;
- Escape: clear the instruction lock;
- click: select and lock an entity or causal chain;
- double-click: focus the selected module;
- click empty space: clear structure selection without pausing.

### 9.2 Commit HUD

A borderless right-side HUD always shows the instruction currently committing:

- cycle, thread, PC, disassembly, and ROB slot;
- physical source/destination registers;
- selected issue queue, issue port, execution pipe, and stages;
- cache/TLSU/Tile activity and stall/flush reason;
- compact path summary.

The lower HUD shows a bounded rolling commit trace. When the user locks another instruction, a pinned causal summary appears below the live commit information; live commit information never disappears.

## 10. Compatibility and Migration

1. Existing `.linxtrace` archives remain loadable.
2. Older topologies without coordinates use the existing built-in layout as an explicit legacy fallback.
3. Detailed features are enabled only when manifest capabilities declare the corresponding event contracts.
4. The incorrect `2560` CELL rows per bank in the current generated topology is a producer bug. The SuperScalarModel adapter, fixtures, public trace, and Viewer tests must be corrected together to 256 rows per bank.
5. Existing synthetic ROB IDs must be normalized to the same canonical `core.scalar.sperob.slotN` form as real traces.

## 11. Performance and Memory

- Remote metadata must become interactive before the full trace is downloaded.
- The Viewer must keep a bounded decoded-chunk cache and a bounded active-token pool.
- Full physical entity counts may be rendered with instancing and LOD, but every entity remains addressable and highlightable.
- No test or build gate should run heavy suites concurrently. Repository CI and local verification use bounded workers to avoid memory spikes.
- Trace generation may be large, but validation and packaging must stream data and maintain aggregate resource limits.

## 12. Testing and Acceptance

### 12.1 SuperScalarModel

Focused tests must prove:

- one instruction retains identity and ordered stages through retirement;
- real ROB slots and pointers survive wraparound and flush;
- PRF source/destination/read/write/free events match model state;
- four threads can access one shared I-Cache or D-Cache line in one cycle;
- cache set/way/line bounds and cross-line requests are correct;
- CELL mapping is exactly 8 banks × 256 rows per PE with 128-byte cells;
- arbitration winners and losers match CellReg state;
- TLSU stage order and request IDs remain stable through response;
- tracing on/off produces identical architectural results.

### 12.2 LinxSimCity

Tests must prove:

- topology positions, sizes, ports, and orthogonal routes validate;
- the scene is topology-driven and exposes every ROB, PRF, cache-line, CELL, and route entity;
- seek reconstructs the same state as forward playback;
- a locked instruction lights the correct ROB, PRF, pipe, cache line, TLSU request, and CELL chain;
- thread color survives every state overlay;
- PE switching changes scalar detail without hiding shared cache or global Tile/CUBE/TLSU activity;
- keyboard and mouse mappings match this specification;
- no persistent panel boundaries remain;
- remote logical bundles fetch only metadata plus the required checkpoint/chunks;
- local ZIP loading remains functional.

### 12.3 Public FA acceptance

The published page must:

1. load the detailed FA logical bundle automatically;
2. begin at 1× playback;
3. show the live commit HUD and advancing cycle;
4. allow PE switching and instruction locking;
5. show real ROB/PRF/cache/CELL/TLSU activity at known reference cycles;
6. pass trace validation, production Pages verification, CI, and browser acceptance;
7. preserve the documented workload completion boundary unless a full-program model run becomes valid.

## 13. Delivery Order

1. Extend and validate physical topology and detailed payload schemas.
2. Correct CELL capacity and canonical IDs.
3. Add SuperScalarModel scalar/ROB/PRF/shared-cache hooks.
4. Add CELL, StgBufB, CUBE, and TLSU detailed hooks.
5. Add runtime causal graph, checkpoints, and remote logical-bundle loader.
6. Replace hard-coded scene placement with topology placement/routes.
7. Implement full-screen input and borderless commit HUD.
8. Generate, validate, and publish the detailed FA trace.
9. Run independent code review, memory-bounded full gates, and public browser acceptance.

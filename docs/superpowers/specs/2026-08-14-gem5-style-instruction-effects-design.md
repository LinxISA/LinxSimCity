# LinxSimCity Gem5-Style Instruction Effects Design

**Status:** Approved direction; pending specification review

**Date:** 2026-08-14

**Repositories:** `LinxISA/LinxSimCity`, `LinxISA/SuperScalarModel`, `LinxISA/linx-isa`

**Reference baseline:** `Entropy-xcy/Gem5SimCity@6c7e0b4ab7ed7b58fdb70527d9ee182db1956483`

## 1. Goal

Give LinxSimCity the continuous instruction animation, dark HDR city, jumping tokens, terminal bursts, and cell-level structure feedback demonstrated by Gem5SimCity, while preserving the real Linx floor plan and SuperScalarModel pipeline semantics.

Every visible instruction is one stable glowing sphere for its complete lifetime. It is born at the shared instruction-cache path, moves through authoritative PipeView stage buildings and pipes, occupies real queue and ROB slots, and terminates at Commit or at the exact physical location where it is squashed.

The design must also expose non-instruction traffic without confusing it with instruction identity: PRF reads and writes, cache requests and returns, 128-byte Tile Register CELL access, TLSU transactions, CUBE A/C movement, Shared Tile Register B broadcast, and memory wait states use separate transient effects linked to the owning instruction or request.

The public FlashAttention trace is the primary acceptance workload. The animation must remain usable on the large rectangular Core without repeating the earlier browser memory failure.

## 2. Relationship to Existing Specifications

This specification extends:

- `2026-08-13-instruction-level-trace-city-design.md`;
- `2026-08-14-pipeview-stage-city-design.md`.

It supersedes two earlier visual rules:

1. The instruction token body no longer identifies the thread. Its core identifies the formal Linx instruction class. Thread identity moves to an outer halo and trail.
2. The scene may use selective HDR bloom. The earlier prohibition on scene-wide bloom is replaced by a bounded post-processing and fallback contract.

All previous physical topology, rectangular floor-plan, stage-building, orthogonal-pipe, shared-cache, 128-byte CELL, and trace-authority decisions remain in force.

## 3. Evidence and Adaptation Boundary

### 3.1 Gem5SimCity concepts to adapt

The reference implementation provides five useful visual and runtime patterns:

- one stable token for a complete instruction lifecycle;
- continuous stage-to-stage interpolation and execution-lane movement;
- event-sourced ROB, PRF, cache, and queue state that can be rebuilt after seek;
- transient effects for branch recovery, register traffic, and cache traffic;
- instanced meshes and preallocated typed arrays for high token counts.

The relevant upstream surfaces are:

- `web/src/scene/City.jsx`: dark scene, fog, bloom, vignette, and navigation;
- `web/src/scene/tokenEngine.js`: instruction lifecycle and terminal motion;
- `web/src/scene/Tokens.jsx`: instanced HDR tokens and additive terminal marks;
- `web/src/scene/Effects.jsx`: event-triggered rings, packets, lights, and beams;
- `web/src/scene/Structures.jsx`: incremental structure state and seek rebuild.

### 3.2 Concepts that must not be copied

LinxSimCity must not reuse Gem5-specific tracer hooks, hard-coded O3 capacities, sequence-number modulo slot allocation, mnemonic-regex classification, or category-specific token geometry.

The upstream repository does not provide a clear reusable license grant. LinxSimCity therefore reimplements the visual behavior from the documented concepts and observable behavior; it does not copy source code.

### 3.3 Linx sources of truth

- `linx-isa` supplies formal `big_kind`, subkind, and tile semantic-engine classification.
- SuperScalarModel supplies instruction timestamps, thread and PE identity, physical sources and destinations, ROB/IQ identity, memory requests, CELL access, TLSU stages, and CUBE stages.
- The trace bundle topology supplies physical scene placement, slot and cell identity, ports, and orthogonal pipe routes.
- The Viewer renders those facts and does not infer missing hardware choices.

## 4. Non-Negotiable Visual Semantics

1. Every instruction token uses the same sphere geometry.
2. The sphere core color identifies the formal instruction class.
3. The outer halo and short trail identify PE-thread `0..3`.
4. Subkind changes pulse cadence, rim pattern, or metadata only; it never replaces the main class color.
5. The Viewer does not classify a mnemonic with regular expressions. Missing classification is rendered as explicit `UNKNOWN` neutral white.
6. Tokens use physical `entity_id`, `slot_id`, `cell_id`, and `route_id` from the trace bundle.
7. A token moves along a declared pipe whenever a pipe exists. It cannot take a visually convenient shortcut through another building.
8. Long-latency waits park the token in their actual stage building. Time does not cause the token to advance without a trace transition.
9. Instruction tokens and data packets are different visual objects. A register value, cache line, CELL payload, or memory response must not masquerade as a new instruction.
10. Commit and squash are terminal. A squashed instruction can never later appear at Commit.

## 5. Instruction Color Contract

### 5.1 Formal classification fields

The producer emits:

```json
{
  "big_kind": "ALU",
  "subkind": "SHIFT",
  "semantic_engine": null,
  "visual_class": "ALU"
}
```

For scalar and command instructions, `visual_class` normally equals `big_kind`. For tile operations, the formal semantic engine may refine the top-level `VEC` class to `VEC`, `TLSU`, `CUBE`, or `SFU`. The producer records the selected `visual_class`; the Viewer validates and consumes it directly.

### 5.2 Core palette

The palette is encoded as linear HDR RGB values derived from the following display colors:

| Visual class | Display color | Meaning |
|---|---|---|
| `ALU` | `#22D8FF` | scalar arithmetic and logic |
| `AGU` | `#76FF03` | address generation |
| `BRU` | `#FFD740` | branch and comparison |
| `AMO` | `#FF7A18` | atomic and ordered memory operations |
| `BBD` | `#9B6CFF` | block-boundary control |
| `CMD` | `#448AFF` | queue, block, descriptor, and engine commands |
| `FSU` | `#FF40FF` | fused or special scalar operations |
| `SYS` | `#D7E7FF` | system, cache-maintenance, trap, and SSR operations |
| `VEC` | `#00E5C7` | vector execution |
| `TLSU` | `#69FF72` | tile load/store and movement |
| `CUBE` | `#FF4F28` | matrix and GMMA execution |
| `SFU` | `#FF5EDB` | tile special-function execution |
| `UNKNOWN` | `#FFFFFF` | invalid or legacy trace without formal classification |

HDR intensity is applied in the material color rather than by allocating one point light per instruction.

### 5.3 Thread palette

| Thread | Halo and trail |
|---|---|
| PE0 | electric blue |
| PE1 | violet |
| PE2 | amber |
| PE3 | emerald |

The halo is a slightly larger, low-alpha additive sphere. The trail contains at most two recent samples by default. The core remains readable when several threads execute the same instruction class concurrently.

## 6. Render Pipeline

### 6.1 Scene appearance

- Background: `#05060F`.
- Fog: the same hue, scaled to the Linx city footprint instead of copying Gem5's smaller absolute distances.
- Buildings: low-opacity dark surfaces, low emissive intensity, and brighter edge lines.
- Active stage bays: thread-colored edge or roof pulse without changing the instruction core color.
- Pipes: always visible at low intensity; active segments receive a traveling emissive pulse.
- Vignette: subtle darkening at the viewport boundary so the Core remains the visual focus.

### 6.2 Selective bloom

The default profile uses an `EffectComposer` with selective HDR bloom and vignette:

- bloom intensity approximately `1.05..1.15`;
- luminance threshold approximately `0.8` for the dense Linx city;
- smoothing approximately `0.15`;
- mipmap blur enabled when supported;
- vignette offset approximately `0.25`, darkness approximately `0.70..0.75`.

The lower `0.25` threshold used by Gem5SimCity is available only as a cinematic profile. It is not the default because the Linx city contains substantially more glowing cells, stages, and pipes and would otherwise wash out the floor plan.

Token, active-cell, ring, and beam materials use `toneMapped={false}` and HDR colors so they cross the bloom threshold. Normal buildings remain below the threshold.

### 6.3 Lighting and shadows

Adding bloom requires reducing the current LinxSimCity scene lighting. The target profile uses subdued ambient and directional light and no per-token light sources.

Dense instanced structures do not cast shadows. A small number of district landmarks may receive or cast a low-cost shadow only when the balanced or cinematic profile is active.

### 6.4 Fallback

If post-processing or the required framebuffer format is unavailable, the scene keeps emissive HDR-style colors without the composer. Instruction identity, physical location, structure state, and terminal semantics remain correct; only bloom and vignette are omitted.

## 7. Instruction Motion Model

### 7.1 Stable lifecycle

One instruction record owns one token from birth through exactly one terminal transition:

```text
shared I$ / Fetch
  -> Decode -> Rename -> Dispatch -> physical IQ slot
  -> PRF read -> selected issue port -> selected execution pipe
  -> Writeback -> physical ROB slot -> Commit
```

Vector, CUBE, and TLSU instructions continue through their domain-specific stage buildings rather than collapsing into one generic Execute building.

### 7.2 Motion primitives

The engine supports four bounded primitives:

1. **Birth:** scale from `0.3` to `1.0` while rising from the shared I-Cache or Fetch entry.
2. **Pipe flight:** interpolate along the topology polyline with a small vertical hop `h * sin(pi * t)`. The horizontal path remains on the pipe.
3. **Slot park:** settle at the exact IQ, ROB, PRF-associated waiting bay, cache wait, or CELL arbitration slot and use a low-frequency breathing pulse.
4. **Terminal:** run the retire or squash effect, then release the token instance.

Short adjacent transitions may look like a jump, but their horizontal route still follows the declared physical pipe.

### 7.3 Timing

- Trace cycles and stage timestamps are authoritative.
- Visual travel duration adapts to the interval between transitions, bounded to a readable fraction of a cycle.
- Several stages recorded at the same cycle may be visually separated by up to `0.3` display cycles. This affects interpolation only and never changes the cycle shown in the HUD.
- A wait stage holds the token for the complete recorded wait.
- Backward seek, checkpoint restore, or a large jump reconstructs token and structure state without replaying every visible effect.

### 7.4 PipeView domains

The stage-building inventory from the PipeView Stage City specification remains authoritative, including:

- Scalar fetch, decode, rename, issue, PRF, execute, writeback, ROB, and retire stages;
- `L1M`, `L2M`, `MR`, `L2R`, `L1R`, and load-return wait states;
- Vector `F..CM` stages;
- CUBE issue, rename, load generation, source readiness, read buffer, control, calculate, L0C write, and commit;
- ACCCVT stages;
- TLSU/MTC and Tile Bridge stages.

## 8. Terminal and Transient Effects

### 8.1 Commit

At retirement, the instruction rises toward Commit on a higher gold arc. A gold additive ring expands at the Commit entrance and fades. The token then shrinks and is released.

The borderless right-side trace HUD displays the committing instruction in real time:

- cycle;
- thread and PE;
- instruction ID, PC, and disassembly;
- formal visual class and subkind;
- ROB slot;
- selected execution pipe;
- destination physical registers;
- associated memory or CELL request when present.

### 8.2 Squash and exception

The token flashes red at its last authoritative physical position, rises briefly, then collapses. An additive red ring and X mark expand and fade. A branch misprediction additionally emits a bounded shockwave at the BRU or recovery building.

All younger affected instructions use their own recorded flush transition. The Viewer does not infer the squash set from screen order.

### 8.3 Rename and PRF

- Rename allocation: purple beam to the exact destination PRF cell.
- Source read: cyan-white beam and short cell flash.
- Writeback: orange-red beam and cell pulse.
- Dependency ready/wakeup: low-intensity green rim.
- Not-ready wait: amber pulse on the physical source relationship.

These are bounded transient effects. PRF contents and readiness remain structure state rather than a one-frame flash.

### 8.4 Shared I-Cache and D-Cache

- Lookup: thread-colored request beam to the exact set and way when known.
- Hit: green line flash.
- Miss: red line pulse followed by a request packet through `L1M -> L2M -> MR`.
- Return: packet through `L2R -> L1R`, then fill pulse on the exact line.
- Writeback or eviction: cyan or amber packet on its physical route.

The four PE-threads share one I-Cache and one D-Cache structure. Simultaneous accesses retain independent thread halos.

### 8.5 Tile Register CELL and arbitration

Every CELL is 128 bytes and individually addressable. An event highlights the exact PE quarter, bank, row, and byte range.

```text
request packet
  -> source-specific per-bank queue
  -> arbitration building
  -> grant or conflict
  -> exact CELL read/write flash
  -> response route
```

A losing request remains parked at the bank entrance with an amber wait ring. A grant receives a short green gate pulse. Cell contents are not represented as instruction spheres.

### 8.6 TLSU

TLSU requests keep one `request_id` across AGU, LDQ/STQ, split or coalescing, shared D-Cache, L2/global memory, response buffer, and PRF or Tile CELL writeback.

The request packet changes state treatment rather than identity:

- address generation: thin yellow pulse;
- issued request: thread halo with operation-colored center;
- miss wait: red breathing ring;
- memory return: cyan packet;
- writeback: destination-structure flash.

### 8.7 CUBE and Shared Tile Register

- A/C movement originates at the exact PE-local bank and travels horizontally through declared pipes.
- B originates in Shared Tile Register below CUBE and broadcasts vertically to the four horizontally split PE strips.
- B broadcast is one linked operation with four branch packets, not four unrelated instructions.
- CUBE stage tokens occupy the real `SrcAReady`, `SrcBReady`, `SrcCReady`, `RdBuffer`, `Ctrl`, `Calc`, `L0CWr`, and Commit buildings.
- Selected MAC groups and accumulator cells pulse only when the trace identifies them. The Viewer does not invent internal K routing.

## 9. Trace Contract Extensions

### 9.1 Instruction classification

Every instruction-lifecycle event carries or resolves through its instruction record:

```text
instruction_id
thread_id
pe_id
pc
disassembly_id
big_kind
subkind
semantic_engine
visual_class
```

Old traces without these fields render `UNKNOWN`; the Viewer does not guess from mnemonic text.

### 9.2 Physical movement

Every transition identifies the physical endpoints and route:

```text
stage_id
from_entity_id
to_entity_id
route_id
begin_cycle
end_cycle
```

The trace bundle's `topology.json` carries endpoint coordinates and route points. Events also carry the relevant physical indices when applicable:

```text
rob_slot
iq_slot
issue_port
pipe_id
phys_reg_ids[]
cache_id / set / way / line_address
cell_id / bank / row / byte_offset / byte_count
queue_id / queue_slot
request_id
```

This satisfies the requirement that physical position is present in the trace contract without repeating raw XYZ coordinates in every event.

### 9.3 Causal linking

Instruction, register, memory, cache, CELL, CUBE, and terminal events share stable instruction and request identifiers. Effects may start only from explicit causal links; proximity in time is insufficient.

## 10. Runtime Architecture

### 10.1 Three runtime layers

1. **Structure reducer:** persistent ROB, PRF, cache, queue, Tile Register, Shared Tile Register, TLSU, and CUBE state at a cycle.
2. **Instruction motion engine:** stable token lifecycle and interpolation between physical locations.
3. **Transient effect engine:** beams, packets, rings, shockwaves, and short-lived flashes.

All three consume the same cycle cursor and trace indexes. A seek restores structure and token state from a checkpoint, then applies a bounded event window. Transient effects are normally suppressed on a large seek.

### 10.2 Data representation

- Structure cells and tokens use instanced meshes.
- Per-instance matrices, colors, phases, and lifetimes live in preallocated typed arrays.
- The render loop allocates no arrays, vectors, materials, geometries, or React elements per frame.
- Active instructions are found through cycle indexes and sorted timestamps rather than a full-trace scan.
- Physical route samples are cached by `route_id`.

## 11. Memory and Performance Contract

The earlier browser memory failure is a release-blocking risk. The default profile therefore enforces bounded resources.

### 11.1 Initial hard caps

- active instruction tokens: `4096` total;
- trail samples: at most `2` per active token;
- transient packets: `256`;
- beams: `128`;
- rings and shockwaves: `64`;
- X or terminal marks: `128`;
- per-token point lights: `0`;
- device-pixel ratio: `1.0..1.5` in the default profile;
- post-processing: half-resolution where supported, no multisampling by default.

Caps are configuration values validated by tests. When a cap is reached, the oldest finished transient instance is reused. Persistent architectural state is never silently discarded.

### 11.2 Adaptive degradation order

If sustained frame time or allocation pressure exceeds the target budget, the Viewer degrades in this order:

1. reduce or disable trail samples;
2. reduce transient packet and ring density;
3. reduce post-processing resolution;
4. reduce DPR toward `1.0`;
5. disable bloom and retain emissive cores.

Instruction position, class color, thread halo, structure state, and terminal correctness are never degraded.

### 11.3 LOD

- City view: district and stage buildings, active pipes, instruction spheres.
- District view: queue slots, ROB slots, cache lines, bank groups.
- Close view: PRF registers, 128-byte CELLs, Shared Tile Register cells, MAC groups.

All instances remain addressable. LOD changes geometry and labels, not trace identity.

## 12. Interaction and HUD

- The WebGL canvas fills the complete page; no panel boundary surrounds the city.
- Mouse drag orbits and pans according to the selected navigation mode; wheel zooms.
- Arrow keys and `WASD` pan the camera; `Q/E` change elevation; Shift accelerates motion.
- Space toggles playback; left/right with a modifier steps or seeks cycles without conflicting with camera motion.
- Hover enlarges a token and highlights its current building, pipe, ROB slot, and causal resources.
- Click pins the instruction and preserves its route and associated events while playback continues.
- The right-side borderless HUD defaults to the instruction currently retiring from the selected PE-thread. A pinned instruction temporarily takes precedence.

## 13. Compatibility and Public Trace

The public default FlashAttention trace must be regenerated with:

- formal instruction classification;
- complete physical stage transitions and pipe routes;
- real ROB, IQ, PRF, cache, Tile CELL, TLSU, and CUBE identifiers;
- causal instruction and request IDs.

Legacy traces remain loadable. Missing classification is visibly `UNKNOWN`, missing physical detail stays inactive, and the Viewer must not fabricate detail to make the animation look complete.

The hosted page deploys the same immutable trace asset verified by repository tests. A version query string may bust browser caches but must not select a different topology or trace contract.

## 14. Acceptance Criteria

1. The public city retains the approved rectangular macro floor plan and contains no building overlap.
2. All instructions use a uniform glowing sphere geometry.
3. Formal instruction class controls the sphere core color; PE-thread controls the halo and trail.
4. No mnemonic-regex classification remains in the default animation path.
5. A token follows actual stage buildings, declared physical pipes, real IQ slots, and real ROB slots.
6. Shared I-Cache and D-Cache line accesses highlight exact set and way cells when the trace provides them.
7. PRF reads and writes highlight exact physical registers and remain causally linked to the instruction.
8. Tile Register access highlights the exact 128-byte CELL and shows queue, arbitration, grant, or conflict state.
9. TLSU requests traverse explicit AGU, queue, cache, miss, return, and destination stages with one request identity.
10. CUBE A/C traffic moves horizontally from local banks; B broadcasts vertically from Shared Tile Register.
11. Retire produces a gold terminal arc and ring; squash produces a red collapse, ring, and X at the authoritative physical position.
12. The right HUD displays the currently committing instruction and its real ROB and physical-resource metadata.
13. Seek and reverse playback reconstruct structure and token state without duplicate terminal effects.
14. The default FA trace plays without exceeding the configured token and effect caps.
15. A browser smoke test completes sustained playback, repeated seek, and camera movement without WebGL context loss or unbounded heap growth.
16. The no-post-processing fallback preserves all architectural semantics.
17. Repository tests verify classification, route adherence, slot identity, seek determinism, effect caps, and public trace compatibility.

## 15. Non-Goals

- Photorealistic semiconductor layout or physical timing extraction.
- Inferring missing pipe routes, registers, slots, cache ways, or CUBE internal routing.
- Copying Gem5SimCity source or gem5 tracer patches.
- Using one light source, geometry, or React component per instruction.
- Making visual interpolation alter trace timing or architectural state.

## 16. Implementation Boundary

Implementation begins only after this specification is reviewed. The subsequent plan must separate:

1. trace classification and physical-event contract;
2. regenerated public FA trace;
3. structure-state reducers and seek semantics;
4. instruction motion engine;
5. transient effects and selective post-processing;
6. HUD and input controls;
7. memory, performance, visual, and deployment verification.

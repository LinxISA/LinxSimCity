# LinxSimCity Gem5-Style Instruction Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every Linx instruction as one formally classified glowing sphere that follows real SuperScalarModel PipeView routes and physical resources, with Gem5-style jumps, terminal bursts, detailed data effects, selective bloom, bounded memory, and a regenerated public FlashAttention trace.

**Architecture:** SuperScalarModel emits the formal LinxISA visual class and complete physical transition identifiers into a capability-gated trace contract. LinxSimCity reduces those events into seekable structure and instruction state, plans motion as pure topology-driven data, and renders three fixed-capacity instanced layers: persistent structure state, instruction cores/halos/trails, and transient packets/beams/rings. The viewer uses selective post-processing with an adaptive fallback and publishes the same validated FA logical bundle that is exercised locally.

**Tech Stack:** C++17, LinxSimCity C++ trace SDK, TypeScript 5.9, Zod 4, React 19, Three.js 0.185, React Three Fiber 9.7, Drei 10.7, React Postprocessing 3.0.4, Postprocessing 6.39.4, Zustand 5, Vitest 4, Vite 8.

## Global Constraints

- Execute LinxSimCity changes in a worktree created from current `origin/main`; do not implement directly on `main`.
- Execute SuperScalarModel changes in a separate worktree created from current `origin/feat/linxsimcity-trace`, after integrating the latest compatible `origin/main` without rewriting the shared remote branch.
- Use TDD for every behavior change and observe the expected RED before production edits.
- Run Vitest with `--maxWorkers=1`; run TypeScript, C++, asset, browser, and build gates sequentially to avoid another memory failure.
- Formal classification data is sourced from `LinxISA/linx-isa@003e78bd3577f129b8b0762f93d0d35e514f8bd4`; the Viewer must not infer classification from mnemonic text.
- The instruction sphere core identifies formal instruction class; PE-thread identity uses the outer halo and trail.
- Physical movement uses `entity_id`, `from_entity_id`, `to_entity_id`, `route_id`, and exact resource indices from the trace bundle; no visual shortcut may cross an undeclared route.
- Every instruction uses one sphere geometry. Register values, cache lines, CELL payloads, and memory responses use distinct data-effect geometry.
- Shared L1I and L1D are rendered once for all four PE-threads.
- Tile Register and Shared Tile Register CELL size is exactly `128` bytes.
- CUBE A/C traffic is horizontal; B broadcast is vertical from Shared Tile Register below CUBE.
- Default hard caps are `4096` active instruction tokens, `8192` trail samples, `256` data packets, `128` beams, `64` rings or shockwaves, and `128` terminal X marks; per-token point-light count is `0`.
- The default render profile limits DPR to `1.0..1.5`, uses no composer multisampling, and must retain a no-post-processing fallback.
- Do not copy Gem5SimCity source. Reimplement the approved observable behavior against Linx contracts.
- A legacy trace without the new capability remains loadable and renders formal class `UNKNOWN`; it does not use a mnemonic-regex fallback.

---

## File and Responsibility Map

### LinxSimCity

- `packages/trace-schema/src/detailed-payloads.ts`: formal class unions, capability name, and detailed payload interfaces.
- `packages/trace-schema/src/schemas.ts`: capability-gated runtime validation for classification and physical transitions.
- `packages/trace-runtime/src/causal/types.ts`: seekable instruction, resource, and transition state.
- `packages/trace-runtime/src/causal/reduce-causal.ts`: deterministic causal reduction and bounded state retention.
- `packages/scene-modules/src/flow/instruction-motion.ts`: pure topology-driven instruction motion.
- `packages/scene-modules/src/flow/instruction-visuals.ts`: class/thread palette and render constants.
- `packages/scene-modules/src/flow/InstructionTokenLayer.tsx`: fixed-capacity core, halo, and trail instances.
- `packages/scene-modules/src/flow/InstructionBursts.tsx`: bounded retire/squash terminal instances.
- `packages/scene-modules/src/flow/effect-events.ts`: pure mapping from trace events to transient effects.
- `packages/scene-modules/src/flow/TransientEffectLayer.tsx`: PRF beams, cache/TLSU/CELL packets, grants, conflicts, and shockwaves.
- `packages/scene-modules/src/flow/DataTokenLayer.tsx`: compatibility wrapper for old traces; no per-event React mesh in the detailed path.
- `packages/scene-core/src/renderer/render-profile.ts`: balanced, cinematic, and compatibility render settings.
- `packages/scene-core/src/renderer/SceneEffects.tsx`: selective bloom and vignette.
- `packages/scene-core/src/renderer/SceneCanvas.tsx`: dark scene, bounded DPR, reduced lighting, and adaptive quality.
- `apps/viewer/src/player/player-store.ts`: selected-PE live commit and seek-safe pinned instruction state.
- `apps/viewer/src/hud/CommitHud.tsx`: real-time formal class, pipe, ROB, PRF, memory, and CELL metadata.
- `apps/viewer/src/input/use-city-controls.ts`: arrow/WASD/QE navigation and non-conflicting playback shortcuts.
- `scripts/generate-supernpubench-showcase.mjs`: deterministic forensic FA trace generation.
- `tests/showcase/default-fa-asset.test.ts`: public trace observability and formal-class acceptance.
- `scripts/verify-pages-build.mjs`: immutable public asset and base-path verification.

### SuperScalarModel

- `TimingSim/trace/linx/instruction_classification.{h,cpp}`: runtime lookup of generated formal classification.
- `TimingSim/trace/linx/generated_instruction_classification.inc`: checked-in generated mnemonic table with LinxISA provenance.
- `scripts/generate_linxsimcity_instruction_classification.py`: deterministic generator from normative LinxISA JSON.
- `TimingSim/trace/linx/detailed_event_payload.{h,cpp}`: classification and physical transition JSON fields.
- `TimingSim/trace/linx/detailed_event_emitter.{h,cpp}`: shared emitter API.
- existing IFU/decode/ROB/issue/pipe/cache/CELL/CUBE/vector/TLSU call sites: authoritative transition emission.
- `tests/linx_trace/instruction_classification_test.cpp`: representative formal-class coverage.
- `tests/linx_trace/scalar_trace_test.cpp`: scalar classification, physical path, ROB, PRF, and cache payload coverage.
- `tests/linx_trace/dsa_trace_test.cpp`: Vector/CUBE formal class and stage coverage.
- `tests/linx_trace/tlsu_trace_test.cpp`: TLSU request identity, wait stages, CELL destinations, and physical routes.

---

### Task 1: Extend the Capability-Gated Trace Contract

**Files:**
- Modify: `packages/trace-schema/src/detailed-payloads.ts`
- Modify: `packages/trace-schema/src/schemas.ts`
- Modify: `packages/trace-schema/src/schemas.test.ts`
- Modify: `packages/trace-schema/schema/linxtrace-v1.schema.json`
- Modify: `docs/trace-format/events.md`

**Interfaces:**
- Produces `InstructionVisualClass`, `UopBigKind`, and `TileSemanticEngine`.
- Adds capability `instruction-visual-class-v1`.
- Extends `DetailedInstructionPayload` with formal classification and physical transition fields.
- Preserves loose legacy payload parsing when the capability is absent.

- [ ] **Step 1: Write failing schema tests for formal classes and physical transitions**

Add table-driven tests requiring all formal classes and rejecting mnemonic-only detailed events when `instruction-visual-class-v1` is active:

```ts
const visualClasses = [
  "AGU", "ALU", "AMO", "BBD", "BRU", "CMD", "FSU", "SYS",
  "VEC", "TLSU", "CUBE", "SFU", "UNKNOWN",
] as const;

test.each(visualClasses)("accepts formal visual class %s", (visual_class) => {
  expect(parseEvent(detailedInstruction({ visual_class }), {
    capabilities: ["instruction-causality-v1", "instruction-visual-class-v1"],
  }).payload).toMatchObject({ visual_class });
});

test("requires a complete physical transition when the visual capability is active", () => {
  expect(() => parseEvent(detailedInstruction({ route_id: undefined }), {
    capabilities: ["instruction-causality-v1", "instruction-visual-class-v1"],
  })).toThrow();
});
```

- [ ] **Step 2: Run RED**

Run:

```sh
npx vitest run packages/trace-schema/src/schemas.test.ts --maxWorkers=1
```

Expected: FAIL because the capability, formal unions, and required fields do not exist.

- [ ] **Step 3: Add exact TypeScript contracts**

Add the following exported surfaces to `detailed-payloads.ts`:

```ts
export const UOP_BIG_KINDS = [
  "AGU", "ALU", "AMO", "BBD", "BRU", "CMD", "FSU", "SYS", "VEC",
] as const;
export type UopBigKind = (typeof UOP_BIG_KINDS)[number];

export const TILE_SEMANTIC_ENGINES = ["VEC", "TLSU", "CUBE", "SFU"] as const;
export type TileSemanticEngine = (typeof TILE_SEMANTIC_ENGINES)[number];

export const INSTRUCTION_VISUAL_CLASSES = [
  ...UOP_BIG_KINDS, "TLSU", "CUBE", "SFU", "UNKNOWN",
] as const;
export type InstructionVisualClass =
  (typeof INSTRUCTION_VISUAL_CLASSES)[number];
```

Extend `DetailedInstructionPayload` with:

```ts
pe_id: TraceThreadId;
big_kind: UopBigKind;
subkind: string;
semantic_engine?: TileSemanticEngine;
visual_class: InstructionVisualClass;
from_entity_id: string;
to_entity_id: string;
start_cycle: number;
end_cycle: number;
```

Require `end_cycle >= start_cycle`, `pe_id === thread_id`, non-empty physical IDs, and a declared `route_id` under the new capability. Keep classification fields optional in the compatibility schema so v1 legacy events remain parseable without the capability.

- [ ] **Step 4: Regenerate and verify the JSON Schema**

Run:

```sh
npm run build --workspace @linxsimcity/trace-schema
npm run export-schema --workspace @linxsimcity/trace-schema
npx vitest run packages/trace-schema/src/schemas.test.ts --maxWorkers=1
```

Expected: generated schema is stable and the focused suite passes.

- [ ] **Step 5: Document the capability and commit**

Document that classification is producer-authored, physical coordinates remain in `topology.json`, and events carry physical references rather than repeated XYZ values.

```sh
git add packages/trace-schema docs/trace-format/events.md
git commit -m "feat(trace): add formal instruction visual classes"
```

---

### Task 2: Generate and Emit Formal LinxISA Classification in SuperScalarModel

**Files:**
- Create: `scripts/generate_linxsimcity_instruction_classification.py`
- Create: `TimingSim/trace/linx/generated_instruction_classification.inc`
- Create: `TimingSim/trace/linx/instruction_classification.h`
- Create: `TimingSim/trace/linx/instruction_classification.cpp`
- Create: `tests/linx_trace/instruction_classification_test.cpp`
- Modify: `TimingSim/trace/linx/detailed_event_payload.h`
- Modify: `TimingSim/trace/linx/detailed_event_payload.cpp`
- Modify: `TimingSim/CMakeLists.txt`
- Modify: `tests/linx_trace/CMakeLists.txt`

**Interfaces:**
- Consumes normative mnemonic classification from `linx-isa@003e78bd3577f129b8b0762f93d0d35e514f8bd4`.
- Produces `InstructionClassification ClassifyInstruction(const SimInstInfo&)`.
- Makes every detailed instruction payload contain `big_kind`, `subkind`, `semantic_engine`, and `visual_class`.

- [ ] **Step 1: Write a failing C++ classification test**

The test must cover one scalar ALU, branch, block command, vector, TLSU, CUBE, and SFU instruction plus unknown handling:

```cpp
const auto alu = ClassifyMnemonic("ADD");
Require(alu.bigKind == "ALU" && alu.visualClass == "ALU", "ADD class");
const auto branch = ClassifyMnemonic("B.EQ");
Require(branch.bigKind == "BRU" && branch.visualClass == "BRU", "B.EQ class");
const auto cube = ClassifyMnemonic("BSTART.TMATMUL");
Require(cube.bigKind == "BBD" && cube.semanticEngine == "CUBE" &&
            cube.visualClass == "CUBE",
        "BSTART.TMATMUL class");
const auto unknown = ClassifyMnemonic("INVALID-LINX-OP");
Require(unknown.visualClass == "UNKNOWN", "unknown class");
```

- [ ] **Step 2: Run RED**

Run the existing trace test configure/build path and the new test target:

```sh
cmake -S . -B build/linxsimcity-effects -DBUILD_TESTING=ON
cmake --build build/linxsimcity-effects --target instruction_classification_test --parallel 1
ctest --test-dir build/linxsimcity-effects -R instruction_classification --output-on-failure
```

Expected: configure or compile fails because the classification API is absent.

- [ ] **Step 3: Implement a deterministic normative generator**

The Python script accepts explicit `--linx-isa` and `--output` arguments, reads:

```text
isa/v0.58/uop_classification_v0.58/**/*.json
isa/v0.58/release_manifest.json
isa/v0.58/state/engine_ops.json
```

It obtains scalar `big_kind` and `subkind` from the leaf classification files, then overlays exact semantic-engine aliases from `engine_ops.json`. For a tile alias, `subkind` is the normative tile `classification` such as `matrix-and-matrix-vector`; `semantic_engine` separately records `CUBE`, `TLSU`, `VEC`, or `SFU`. It sorts by canonical mnemonic and writes one generated record per mnemonic:

```cpp
{"BSTART.TMATMUL", "BBD", "matrix-and-matrix-vector", "CUBE", "CUBE"},
```

The generated file header records the exact LinxISA commit. The generator refuses a source revision other than the pinned commit unless `--allow-revision` is explicitly passed. Running it twice must produce byte-identical output.

- [ ] **Step 4: Implement the lookup and payload fields**

Define:

```cpp
struct InstructionClassification {
    std::string bigKind;
    std::string subkind;
    std::string semanticEngine;
    std::string visualClass;
};

InstructionClassification ClassifyMnemonic(const std::string &mnemonic);
InstructionClassification ClassifyInstruction(const SimInstInfo &inst);
```

Use `GetOpcodeName(inst.opcode)` as the scalar lookup key. For decoded BSTART tile operations, use the exact first mnemonic token already stored by `MInst::GetAssembleStr()` so `BSTART.TMATMUL`, `BSTART.TLOAD`, and TEPL/SFU aliases select their normative `engine_ops.json` entry. This token extraction selects a table key; it does not classify by prefix or regex. `DetailedInstructionPayload` serializes the four returned strings and emits `semantic_engine` only when it is non-empty.

- [ ] **Step 5: Run GREEN and deterministic generation checks**

Run:

```sh
python3 scripts/generate_linxsimcity_instruction_classification.py \
  --linx-isa /tmp/linx-isa-reference.RhI9gU \
  --output TimingSim/trace/linx/generated_instruction_classification.inc
git diff --exit-code -- TimingSim/trace/linx/generated_instruction_classification.inc
cmake --build build/linxsimcity-effects --target instruction_classification_test --parallel 1
ctest --test-dir build/linxsimcity-effects -R instruction_classification --output-on-failure
```

Expected: no generated diff and the focused CTest passes.

- [ ] **Step 6: Commit the producer classification**

```sh
git add scripts/generate_linxsimcity_instruction_classification.py \
  TimingSim/trace/linx tests/linx_trace TimingSim/CMakeLists.txt
git commit -m "feat(trace): emit normative Linx instruction classes"
```

---

### Task 3: Emit Complete Physical PipeView Transitions and Causal Effects

**Files:**
- Modify: `TimingSim/trace/linx/detailed_event_payload.{h,cpp}`
- Modify: `TimingSim/trace/linx/detailed_event_emitter.{h,cpp}`
- Modify: `TimingSim/frontend/ifu.cpp`
- Modify: `TimingSim/frontend/decode/Decoder.cpp`
- Modify: `TimingSim/frontend/rob/SPEROB.cpp`
- Modify: `TimingSim/scalar_pe/iex/iex_dispatch.cpp`
- Modify: `TimingSim/scalar_pe/iex/iex_iq.cpp`
- Modify: `TimingSim/scalar_pe/iex/pipe/{alu,bru,cmd,lda,sta,std}_pipe.cpp`
- Modify: `TimingSim/scalar_pe/lsu/l1/{L1DCache,cluster}.cpp`
- Modify: `TimingSim/scalar_pe/lsu/load_unit/ldq.cpp`
- Modify: `TimingSim/pe/vec/VecTop.cpp`
- Modify: `TimingSim/pe/cube/CubeCore.cpp`
- Modify: `TimingSim/pe/cell/CellReg.cpp`
- Modify: `TimingSim/group/tlsu/tile_lsu.cpp`
- Modify: `tests/linx_trace/{scalar_trace,dsa_trace,tlsu_trace}_test.cpp`

**Interfaces:**
- Consumes formal classification from Task 2.
- Produces detailed events with `pe_id`, exact IQ/ROB/PRF/cache/CELL indices, physical endpoints, route, and stage timing.
- Uses the stage IDs declared in `PIPEVIEW_STAGE_DOMAINS`; it does not create alternate spellings.

- [ ] **Step 1: Write failing physical-path tests**

Extend the bundle tests to assert a scalar chain contains ordered transitions with complete endpoints:

```cpp
RequireContains(issue, R"("iq_slot":3)");
RequireContains(issue, R"("from_entity_id":"pipeview.scalar.iq")");
RequireContains(issue, R"("to_entity_id":"pipeview.scalar.p1")");
RequireContains(issue, R"("route_id":"pipeview.scalar.iq-to-p1")");
RequireContains(issue, R"("start_cycle":)");
RequireContains(issue, R"("end_cycle":)");
```

Add equivalent assertions for `L1M -> L2M -> MR -> L2R`, Vector `I -> E1`, CUBE `SrcAReady/SrcBReady -> Calc`, and TLSU `AGU -> LDQ/STQ -> cache/memory -> response`.

- [ ] **Step 2: Run RED**

Run:

```sh
cmake --build build/linxsimcity-effects \
  --target scalar_trace_test dsa_trace_test tlsu_trace_test --parallel 1
ctest --test-dir build/linxsimcity-effects \
  -R 'scalar_trace|dsa_trace|tlsu_trace' --output-on-failure
```

Expected: tests fail on missing physical endpoints, route timing, or exact slots.

- [ ] **Step 3: Extend the shared emitter API**

Use one explicit transition value object:

```cpp
struct PhysicalTransition {
    std::string fromEntityId;
    std::string toEntityId;
    std::string routeId;
    std::uint64_t startCycle{0};
    std::uint64_t endCycle{0};
};

void EmitInstructionStage(SimSys *sim, const std::string &eventType,
                          const SimInst &inst, const std::string &stage,
                          const std::string &entityId,
                          const PhysicalTransition &transition,
                          std::uint32_t issuePort,
                          std::string pipeId, std::string fuKind,
                          std::string reason);
```

`DetailedInstructionPayload` emits `iq_slot` from `inst.iqid`, `pe_id` from `inst.peID`, and validates that the route and endpoints are non-empty before an event is submitted.

- [ ] **Step 4: Instrument authoritative boundaries**

Emit transitions only when the corresponding model boundary executes. Use `CycleInfo` timestamps for the physical interval and the canonical topology IDs for endpoints. In particular:

- fetch/ICache stages use the shared L1I entity;
- PRF reads are emitted at I1/read, not at rename;
- the selected scalar `pipe_id` comes from the real IQ/FU assignment;
- L1/L2/memory wait transitions use `L1M`, `L2M`, `MR`, `L2R`, and `L1R` stage IDs;
- CELL events retain `request_id`, `phys_cell_id`, bank, row, port class, arbitration result, and wait cycles;
- CUBE A routes originate at PE-local bank entities and B routes originate at Shared Tile Register;
- TLSU maintains one `request_id` from AGU through response and destination writeback.

- [ ] **Step 5: Run focused model GREEN**

Run:

```sh
cmake --build build/linxsimcity-effects \
  --target instruction_classification_test scalar_trace_test \
  dsa_trace_test tlsu_trace_test --parallel 1
ctest --test-dir build/linxsimcity-effects \
  -R 'instruction_classification|scalar_trace|dsa_trace|tlsu_trace' \
  --output-on-failure
```

Expected: all detailed trace tests pass and no event uses an unresolved route.

- [ ] **Step 6: Commit physical emission**

```sh
git add TimingSim tests/linx_trace
git commit -m "feat(trace): emit physical PipeView transitions"
```

---

### Task 4: Reduce Formal Instruction and Physical Resource State

**Files:**
- Modify: `packages/trace-runtime/src/causal/types.ts`
- Modify: `packages/trace-runtime/src/causal/reduce-causal.ts`
- Modify: `packages/trace-runtime/src/causal/reduce-causal.test.ts`
- Modify: `packages/trace-runtime/src/reducer/checkpoint.ts`
- Modify: `packages/trace-runtime/src/reducer/seek.test.ts`

**Interfaces:**
- Consumes Task 1 detailed payloads.
- Produces `InstructionTraceState.visualClass`, formal metadata, physical transition intervals, current pipe/FU, and request/resource links.
- Retains at most `48` physical transitions per visible instruction and at most `4096` active instructions.

- [ ] **Step 1: Write failing reducer and seek tests**

Build a fixture with two threads executing the same ALU class, different halos, a cache miss wait, a CELL grant, retire, and squash. Assert classification and physical transitions survive checkpoint restore:

```ts
expect(restored.causal.instructions.get(9812)).toMatchObject({
  bigKind: "ALU",
  subkind: "SHIFT",
  visualClass: "ALU",
  currentPipeId: "pe2.scalar.pipe.alu",
  currentFuKind: "alu",
});
expect(restored.causal.instructions.get(9812)?.transitions.at(-1)).toEqual({
  cycle: 18,
  seq: 1,
  stageId: "W1",
  fromEntityId: "pipeview.scalar.e5",
  toEntityId: "pipeview.scalar.w1",
  routeId: "pipeview.scalar.e5-to-w1",
  startCycle: 17,
  endCycle: 18,
  type: "pipeline.enter",
  entityId: "pipeview.scalar.w1",
});
```

- [ ] **Step 2: Run RED**

Run:

```sh
npx vitest run packages/trace-runtime/src/causal packages/trace-runtime/src/reducer/seek.test.ts --maxWorkers=1
```

Expected: FAIL because formal and physical transition fields are absent.

- [ ] **Step 3: Extend the state types and reducer**

Define the physical transition fields exactly once:

```ts
export interface InstructionTransition {
  readonly cycle: number;
  readonly seq: number;
  readonly type: TraceEventType;
  readonly stageId: string;
  readonly entityId: string;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly routeId: string;
  readonly startCycle: number;
  readonly endCycle: number;
}
```

Extend `InstructionTraceState` with `peId`, `bigKind`, `subkind`, `semanticEngine`, `visualClass`, `iqSlot`, `issuePort`, `currentPipeId`, and `currentFuKind`. Append only authoritative instruction/pipeline transitions, deduplicate by `(cycle, seq)`, keep the most recent 48, and reject a retire transition after squash.

Limit active instructions before serialization. When the map reaches 4096, remove terminal instructions in oldest-terminal order; if no terminal instruction is available, throw a diagnostic `instruction_capacity_exceeded` rather than silently dropping a live instruction.

- [ ] **Step 4: Run reducer GREEN and checkpoint equivalence twice**

Run twice:

```sh
npx vitest run packages/trace-runtime/src/causal packages/trace-runtime/src/reducer/seek.test.ts --maxWorkers=1
```

Expected: both runs pass and linear reduction equals checkpoint restore plus replay.

- [ ] **Step 5: Commit runtime state**

```sh
git add packages/trace-runtime/src/causal packages/trace-runtime/src/reducer
git commit -m "feat(runtime): retain formal physical instruction state"
```

---

### Task 5: Replace Mnemonic Heuristics with a Pure Physical Motion Planner

**Files:**
- Create: `packages/scene-modules/src/flow/instruction-visuals.ts`
- Create: `packages/scene-modules/src/flow/instruction-visuals.test.ts`
- Modify: `packages/scene-modules/src/flow/instruction-motion.ts`
- Modify: `packages/scene-modules/src/flow/instruction-motion.test.ts`
- Modify: `packages/scene-modules/src/flow/instruction-layer.ts`

**Interfaces:**
- Consumes formal `InstructionTraceState` and physical topology routes.
- Produces `InstructionVisualState` with `visualClass`, `threadId`, position, scale, pulse, overlay, and terminal progress.
- Exports `coreColor(class)`, `threadHaloColor(thread)`, and the approved hard-cap constants.

- [ ] **Step 1: Write failing color and motion tests**

Delete expectations based on mnemonic prefixes. Add tests proving:

```ts
expect(coreColor("ALU")).toBe("#22d8ff");
expect(coreColor("CUBE")).toBe("#ff4f28");
expect(threadHaloColor(2)).not.toBe(coreColor("ALU"));
expect(planInstructionMotion(instruction, 12.5, topology)?.visualClass)
  .toBe("ALU");
```

Also assert piecewise distance interpolation follows every orthogonal route point, adds only a vertical `sin(pi*t)` hop, parks for a multi-cycle `L2M` interval, visually spreads same-cycle stages without changing the reported cycle, and never resolves a missing route with a hard-coded coordinate.

- [ ] **Step 2: Run RED**

Run:

```sh
npx vitest run packages/scene-modules/src/flow/instruction-visuals.test.ts packages/scene-modules/src/flow/instruction-motion.test.ts --maxWorkers=1
```

Expected: FAIL because the formal palette and interval-based planner do not exist.

- [ ] **Step 3: Implement the formal palette and motion interface**

Use:

```ts
export interface InstructionVisualState {
  readonly instructionId: number;
  readonly threadId: TraceThreadId;
  readonly visualClass: InstructionVisualClass;
  readonly position: TopologyVector3;
  readonly scale: number;
  readonly pulse: number;
  readonly overlay: "normal" | "retire" | "squash";
  readonly terminalProgress: number;
  readonly terminalAge: number;
}
```

Remove `instructionCategory(disassemblyId)` and all regex classification. Motion chooses the transition whose `[startCycle, endCycle]` contains `visualCycle`, interpolates along `route_id`, and parks at `to_entity_id` after the interval. Same-cycle display spreading is derived in a temporary visual schedule and is not written back to the trace state.

- [ ] **Step 4: Implement terminal motion against physical endpoints**

Retire begins at the recorded ROB slot and ends at the recorded Commit entity with a `2.6`-unit gold arc. Squash remains at the last non-terminal physical position, pops for `0.15` cycles, and collapses by `0.7` cycles. Both transitions are deterministic under seek.

- [ ] **Step 5: Run GREEN and commit**

Run:

```sh
npx vitest run packages/scene-modules/src/flow/instruction-visuals.test.ts packages/scene-modules/src/flow/instruction-motion.test.ts --maxWorkers=1
```

Then:

```sh
git add packages/scene-modules/src/flow
git commit -m "feat(scene): plan formal instruction orb motion"
```

---

### Task 6: Render Uniform HDR Cores, Thread Halos, Trails, and Terminal Bursts

**Files:**
- Modify: `packages/scene-modules/src/flow/InstructionTokenLayer.tsx`
- Modify: `packages/scene-modules/src/flow/InstructionBursts.tsx`
- Modify: `packages/scene-modules/src/flow/instruction-layer.test.ts`
- Create: `packages/scene-modules/src/flow/instruction-instance-plan.ts`
- Create: `packages/scene-modules/src/flow/instruction-instance-plan.test.ts`

**Interfaces:**
- Consumes Task 5 visual states.
- Produces one instanced sphere core, one instanced sphere halo, and at most two instanced trail samples per active instruction.
- Keeps selection mapping stable by instruction ID and emits no per-token point light.

- [ ] **Step 1: Write failing fixed-capacity instance-plan tests**

Use a pure planner so capacity, ordering, colors, and hover scaling can be tested without WebGL:

```ts
const plan = planInstructionInstances(visuals, {
  hoveredInstructionId: 9,
  tokenCapacity: 4096,
  trailCapacity: 8192,
});
expect(plan.cores).toHaveLength(visuals.length);
expect(plan.halos[0]?.color).toBe(threadHaloColor(visuals[0]!.threadId));
expect(plan.cores.find(({ instructionId }) => instructionId === 9)?.scale)
  .toBeCloseTo(1.35);
expect(plan.trails.length).toBeLessThanOrEqual(8192);
```

Assert overflow reuses no live slot and reports an explicit capacity diagnostic.

- [ ] **Step 2: Run RED**

Run:

```sh
npx vitest run packages/scene-modules/src/flow/instruction-instance-plan.test.ts packages/scene-modules/src/flow/instruction-layer.test.ts --maxWorkers=1
```

Expected: FAIL because uniform core/halo/trail planning is absent.

- [ ] **Step 3: Replace category meshes with three fixed instanced layers**

Use a single shared sphere geometry for every core:

```tsx
<instancedMesh ref={cores} args={[undefined, undefined, 4096]}>
  <sphereGeometry args={[1, 12, 10]} />
  <meshBasicMaterial vertexColors toneMapped={false} />
</instancedMesh>
```

Use a second low-alpha additive sphere for halos and a low-segment sphere for trails. Preallocate matrices, colors, IDs, and phases once. `useFrame` may mutate those buffers but must not create arrays, `Vector3`, `Color`, geometry, material, or React elements.

- [ ] **Step 4: Bound terminal bursts**

Change retire/squash pools to `64` rings/shockwaves and `128` X marks. Retire rings use HDR gold; squash rings and X marks use HDR red. A large seek resets pools and does not replay terminal effects.

- [ ] **Step 5: Run GREEN and commit**

Run:

```sh
npx vitest run packages/scene-modules/src/flow/instruction-instance-plan.test.ts packages/scene-modules/src/flow/instruction-layer.test.ts --maxWorkers=1
```

Then:

```sh
git add packages/scene-modules/src/flow
git commit -m "feat(scene): render bounded instruction orbs and bursts"
```

---

### Task 7: Add Instanced PRF, Cache, CELL, TLSU, CUBE, and Branch Effects

**Files:**
- Create: `packages/scene-modules/src/flow/effect-events.ts`
- Create: `packages/scene-modules/src/flow/effect-events.test.ts`
- Create: `packages/scene-modules/src/flow/TransientEffectLayer.tsx`
- Modify: `packages/scene-modules/src/flow/DataTokenLayer.tsx`
- Modify: `packages/scene-modules/src/City.tsx`
- Modify: `packages/scene-modules/src/common/InstancedBoxes.tsx`
- Modify: `packages/scene-modules/src/common/colors.ts`
- Modify: `packages/scene-modules/src/stages/StageCity.tsx`

**Interfaces:**
- Consumes current-cycle active events, causal state, and topology.
- Produces bounded `beam`, `packet`, `ring`, `gate`, `shockwave`, and `pipe-pulse` effect records.
- Keeps persistent architectural state in existing structure reducers and uses effects only for transient motion.

- [ ] **Step 1: Write failing event-to-effect tests**

Cover exact physical targets and causal IDs:

```ts
expect(effectsForEvent(registerRead, topology)).toEqual([
  expect.objectContaining({
    kind: "beam",
    instructionId: 9812,
    toEntityId: "pe2.prf.reg37",
    color: "prf-read",
  }),
]);
expect(effectsForEvent(cellConflict, topology)).toEqual([
  expect.objectContaining({ kind: "ring", color: "cell-conflict" }),
]);
```

Add tests for shared-cache hit/miss/fill, `L1M -> L2M -> MR -> L2R`, Tile CELL grant/conflict, horizontal CUBE A, vertical B broadcast, TLSU return, and branch mispredict shockwave.

- [ ] **Step 2: Run RED**

Run:

```sh
npx vitest run packages/scene-modules/src/flow/effect-events.test.ts --maxWorkers=1
```

Expected: FAIL because the pure effect mapping does not exist.

- [ ] **Step 3: Implement effect records and route cache**

Define:

```ts
export interface TransientEffect {
  readonly key: string;
  readonly kind: "beam" | "packet" | "ring" | "gate" | "shockwave" | "pipe-pulse";
  readonly instructionId?: number;
  readonly requestId?: number;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly routeId?: string;
  readonly startCycle: number;
  readonly endCycle: number;
  readonly color: EffectColor;
}
```

Cache topology entity and route lookup by topology object. Reject a physical-layout event whose endpoint or route is missing; use legacy hard-coded routes only when `topology.layout` is absent and the trace lacks the detailed capability.

- [ ] **Step 4: Replace per-event React meshes with bounded instances**

`TransientEffectLayer` owns `256` packet instances, `128` beam instances, and `64` ring/shockwave instances. `DataTokenLayer` delegates detailed events to it and remains only as the legacy compatibility entry point. No `.map()` creates one React mesh per trace event in the detailed path.

Use building/cell colors for persistent feedback:

- PRF allocate purple, read cyan-white, write orange-red, ready green;
- cache hit green, miss red, fill cyan, eviction amber;
- CELL grant green, conflict amber/red, read cyan, write orange;
- wait buildings pulse while occupied;
- active declared pipe segments brighten without changing geometry.

- [ ] **Step 5: Run GREEN and commit**

Run:

```sh
npx vitest run packages/scene-modules/src/flow packages/scene-modules/src/common packages/scene-modules/src/stages --maxWorkers=1
```

Then:

```sh
git add packages/scene-modules/src
git commit -m "feat(scene): animate physical data and recovery effects"
```

---

### Task 8: Add Selective Bloom, Dark-City Lighting, and Adaptive Quality

**Files:**
- Modify: `package-lock.json`
- Modify: `packages/scene-core/package.json`
- Create: `packages/scene-core/src/renderer/render-profile.ts`
- Create: `packages/scene-core/src/renderer/render-profile.test.ts`
- Create: `packages/scene-core/src/renderer/SceneEffects.tsx`
- Modify: `packages/scene-core/src/renderer/SceneCanvas.tsx`
- Modify: `packages/scene-core/src/index.ts`

**Interfaces:**
- Produces `RenderProfileName = "balanced" | "cinematic" | "compatibility"`.
- Produces pure `profileForQuality(name, level)` settings.
- Adds `@react-three/postprocessing@3.0.4` and `postprocessing@6.39.4`; no other dependency.

- [ ] **Step 1: Write failing render-profile tests**

Test the exact defaults and degradation order:

```ts
expect(profileForQuality("balanced", 4)).toMatchObject({
  background: "#05060f",
  dpr: 1.5,
  bloom: { enabled: true, intensity: 1.1, threshold: 0.8, smoothing: 0.15 },
  trailSamples: 2,
});
expect(profileForQuality("balanced", 0)).toMatchObject({
  dpr: 1,
  bloom: { enabled: false },
  trailSamples: 0,
});
```

Assert decline order is trails, transient density, bloom resolution, DPR, then bloom disable.

- [ ] **Step 2: Run RED**

Run:

```sh
npx vitest run packages/scene-core/src/renderer/render-profile.test.ts --maxWorkers=1
```

Expected: FAIL because profiles and dependencies do not exist.

- [ ] **Step 3: Install only the approved post-processing versions**

Run:

```sh
npm install --workspace @linxsimcity/scene-core \
  @react-three/postprocessing@3.0.4 postprocessing@6.39.4
npm ls @react-three/postprocessing postprocessing three
```

Expected: one compatible Three.js 0.185 graph and no invalid peer dependency.

- [ ] **Step 4: Implement profiles and composer**

`SceneEffects` uses:

```tsx
<EffectComposer multisampling={0} enabled={profile.bloom.enabled}>
  <Bloom
    intensity={profile.bloom.intensity}
    luminanceThreshold={profile.bloom.threshold}
    luminanceSmoothing={profile.bloom.smoothing}
    mipmapBlur
  />
  <Vignette offset={0.25} darkness={0.72} />
</EffectComposer>
```

Balanced uses threshold `0.8`; cinematic uses `0.25`; compatibility omits the composer. `SceneCanvas` changes background/fog to `#05060f`, reduces ambient/directional intensity, removes the high-intensity point light, uses `antialias: false`, caps DPR at the selected profile, sets `shadows={false}` by default, and retains OrbitControls damping.

- [ ] **Step 5: Add adaptive decline without per-frame allocation**

Use Drei `PerformanceMonitor` to lower an integer quality level after sustained decline and raise it only after a stable incline window. Apply quality to DPR, effect density, bloom, and trail samples through memoized profile data. Do not sample `performance.memory` as a correctness requirement because it is browser-specific.

- [ ] **Step 6: Run GREEN, typecheck, and commit**

Run:

```sh
npx vitest run packages/scene-core/src/renderer/render-profile.test.ts --maxWorkers=1
npm run typecheck --workspace @linxsimcity/scene-core
```

Then:

```sh
git add package-lock.json packages/scene-core
git commit -m "feat(scene): add bounded HDR bloom profiles"
```

---

### Task 9: Complete Live Commit HUD, Pinning, Hover, and Keyboard Navigation

**Files:**
- Modify: `apps/viewer/src/player/player-store.ts`
- Modify: `apps/viewer/src/player/player-store.test.ts`
- Modify: `apps/viewer/src/hud/CommitHud.tsx`
- Modify: `apps/viewer/src/hud/CommitHud.test.tsx`
- Modify: `apps/viewer/src/input/use-city-controls.ts`
- Modify: `apps/viewer/src/input/use-city-controls.test.tsx`
- Modify: `apps/viewer/src/scene/SceneViewport.tsx`
- Modify: `apps/viewer/src/app/App.tsx`
- Modify: `apps/viewer/src/app/styles.css`

**Interfaces:**
- Default HUD instruction is the latest retiring instruction for the selected PE.
- Pinned instruction overrides the detailed route section without hiding live commit.
- Camera nudge contains `x`, `y`, and `z`; Shift multiplies speed.

- [ ] **Step 1: Write failing store and HUD tests**

Assert PE selection changes the live commit and the HUD renders formal and physical metadata:

```ts
expect(store.getState().liveCommit?.threadId).toBe(0);
store.getState().selectPe(2);
expect(store.getState().liveCommit?.threadId).toBe(2);
```

```tsx
expect(screen.getByText(/ALU · SHIFT/)).toBeInTheDocument();
expect(screen.getByText(/PIPE pe2\.scalar\.pipe\.alu/)).toBeInTheDocument();
expect(screen.getByText(/DST p37/)).toBeInTheDocument();
```

- [ ] **Step 2: Write failing keyboard tests**

Assert arrows and WASD pan, Q/E change elevation, Shift accelerates camera movement, Space toggles playback, `1..4` select PE, `F` follows commit, Escape unpins, and Shift+left/right steps cycles without also moving the camera.

- [ ] **Step 3: Run RED**

Run:

```sh
npx vitest run apps/viewer/src/player/player-store.test.ts apps/viewer/src/hud/CommitHud.test.tsx apps/viewer/src/input/use-city-controls.test.tsx --maxWorkers=1
```

Expected: FAIL on selected-PE commit, new metadata, WASD/QE, and accelerated camera events.

- [ ] **Step 4: Implement selected-PE commit and borderless metadata**

Change commit selection to:

```ts
function commitState(snapshot: SerializedViewerSnapshot, selectedPe: TraceThreadId) {
  const retired = snapshot.causal.instructions
    .map(([, instruction]) => instruction)
    .filter((instruction) =>
      instruction.threadId === selectedPe && instruction.retired && !instruction.squashed)
    .sort((left, right) =>
      right.lastCycle - left.lastCycle || right.id - left.id);
  return { liveCommit: retired[0], recentCommits: retired.slice(0, 8) };
}
```

Render visual class, subkind, current pipe/FU, ROB/IQ slot, source/destination physical registers, request IDs, and route path. Preserve the full-screen canvas and existing borderless HUD styling.

- [ ] **Step 5: Implement camera controls and token hover/pin behavior**

Extend `CameraNudge` to `{ x, y, z }`, apply movement to both camera and OrbitControls target, and use a `3`-unit base step with a `4x` Shift multiplier. Keep Shift+left/right reserved for cycle stepping. Token hover enlarges only the matching instance; click pins it; Escape clears it.

- [ ] **Step 6: Run GREEN and commit**

Run:

```sh
npx vitest run apps/viewer/src/player/player-store.test.ts apps/viewer/src/hud/CommitHud.test.tsx apps/viewer/src/input/use-city-controls.test.tsx --maxWorkers=1
```

Then:

```sh
git add apps/viewer/src
git commit -m "feat(viewer): expose live physical instruction traces"
```

---

### Task 10: Regenerate and Validate the Public FlashAttention Trace

**Files:**
- Modify: `scripts/generate-supernpubench-showcase.mjs`
- Modify: `tests/showcase/generate-supernpubench-showcase.test.ts`
- Modify: `tests/showcase/default-fa-asset.test.ts`
- Modify: `apps/viewer/public/traces/supernpubench-fa-250-blocks/**`
- Modify: `apps/viewer/public/traces/supernpubench-fa-250-blocks.linxtrace`
- Modify: `scripts/verify-pages-build.mjs`
- Modify: `tests/pages-deployment.test.ts`

**Interfaces:**
- Consumes the Task 2/3 SuperScalarModel trace producer and the current stage-city topology enrichment.
- Produces a forensic FA logical bundle and matching downloadable archive.
- Adds `instruction-visual-class-v1` to the manifest and preserves all previous physical capabilities.

- [ ] **Step 1: Write failing generator and asset assertions**

Require the FA workload plan to use `trace.linx_profile=forensic`. Extend the asset test to inspect all chunks and assert every instruction/pipeline event contains:

```ts
expect(event.payload).toMatchObject({
  instruction_id: expect.any(Number),
  thread_id: expect.any(Number),
  pe_id: expect.any(Number),
  big_kind: expect.any(String),
  subkind: expect.any(String),
  visual_class: expect.any(String),
  from_entity_id: expect.any(String),
  to_entity_id: expect.any(String),
  route_id: expect.any(String),
  start_cycle: expect.any(Number),
  end_cycle: expect.any(Number),
});
```

Require non-zero counts for every trace family used by the animation and verify all physical references resolve in topology.

- [ ] **Step 2: Run RED against the current public asset**

Run:

```sh
npx vitest run tests/showcase/generate-supernpubench-showcase.test.ts tests/showcase/default-fa-asset.test.ts --maxWorkers=1
```

Expected: FAIL because the current asset lacks the new capability and formal classification fields.

- [ ] **Step 3: Generate a fresh bounded forensic FA bundle**

Build the updated model and CLI sequentially:

```sh
cmake --build \
  /Users/zhoubot/Documents/SuperScalarModel/.worktrees/linxsimcity-effects/build/linxsimcity-effects \
  --target gfsim --parallel 1
npm run build --workspace @linxsimcity/linxtrace
```

Then run:

```sh
npm run showcase:generate -- \
  --model /Users/zhoubot/Documents/SuperScalarModel/.worktrees/linxsimcity-effects \
  --bench /Users/zhoubot/Documents/supernpubench-smoke-20260807 \
  --output /Users/zhoubot/Documents/LinxSimCity-showcase/gem5-effects-20260814
```

Enrich the generated FA topology:

```sh
npm run showcase:stage-city -- \
  --trace-dir /Users/zhoubot/Documents/LinxSimCity-showcase/gem5-effects-20260814/fa-250-blocks.trace-dir
```

Validate and pack again after enrichment so archive and logical directory match:

```sh
node tools/linxtrace/dist/main.js validate \
  /Users/zhoubot/Documents/LinxSimCity-showcase/gem5-effects-20260814/fa-250-blocks.trace-dir
node tools/linxtrace/dist/main.js pack \
  /Users/zhoubot/Documents/LinxSimCity-showcase/gem5-effects-20260814/fa-250-blocks.trace-dir \
  /Users/zhoubot/Documents/LinxSimCity-showcase/gem5-effects-20260814/supernpubench-fa-250-blocks-enriched.linxtrace
```

- [ ] **Step 4: Replace the public asset deterministically**

Copy the validated logical directory and enriched archive into the two public paths, update exact event/entity counts and SHA-256 constants in tests and `verify-pages-build.mjs`, and record both repository revisions in the generated provenance. Do not alter event cycles during topology enrichment.

- [ ] **Step 5: Run asset and Pages GREEN**

Run:

```sh
npx vitest run tests/showcase/default-fa-asset.test.ts tests/pages-deployment.test.ts --maxWorkers=1
npm run pages:verify
```

Expected: all required event families are non-zero, every physical reference resolves, topology collision validation passes, and the Pages artifact contains the exact validated trace hashes.

- [ ] **Step 6: Commit the public trace**

```sh
git add scripts tests apps/viewer/public/traces
git commit -m "feat(showcase): publish classified physical FA trace"
```

---

### Task 11: Run Sequential Visual, Memory, Repository, and Deployment Verification

**Files:**
- Create: `docs/superpowers/reports/2026-08-14-gem5-style-instruction-effects-preview.md`
- Modify: `docs/showcase.md`

**Interfaces:**
- Consumes all previous tasks.
- Produces reproducible local/public visual evidence, memory observations, and final gate results.

- [ ] **Step 1: Run focused tests sequentially**

```sh
npx vitest run packages/trace-schema/src/schemas.test.ts --maxWorkers=1
npx vitest run packages/trace-runtime/src/causal packages/trace-runtime/src/reducer/seek.test.ts --maxWorkers=1
npx vitest run packages/scene-core/src packages/scene-modules/src --maxWorkers=1
npx vitest run apps/viewer/src --maxWorkers=1
npx vitest run tests/showcase tests/pages-deployment.test.ts --maxWorkers=1
```

Expected: every command passes without a worker restart or out-of-memory termination.

- [ ] **Step 2: Run repository gates sequentially**

```sh
npm run typecheck
npm test -- --maxWorkers=1
npm run lint
npm run format:check
npm run build
npm run pages:verify
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 3: Run SuperScalarModel gates sequentially**

```sh
cmake --build build/linxsimcity-effects --parallel 1
ctest --test-dir build/linxsimcity-effects \
  -R 'instruction_classification|scalar_trace|dsa_trace|tlsu_trace|topology_builder' \
  --output-on-failure
```

Expected: updated trace targets and focused CTests pass.

- [ ] **Step 4: Perform local browser acceptance**

Start the production preview and inspect it with the in-app browser:

```sh
npm run build:pages --workspace @linxsimcity/viewer
npm run preview --workspace @linxsimcity/viewer -- --host 127.0.0.1
```

Run the following sequence without reloading the WebGL page between checks:

1. play the default FA trace for at least `300` displayed cycles;
2. confirm ALU, BRU, TLSU, VEC, CUBE, and SFU cores use distinct colors;
3. confirm PE halo colors remain distinct for the same instruction class;
4. follow one scalar instruction through shared L1I, stages, real pipe, ROB, and Commit;
5. inspect a PRF read/write, L1 miss/return, 128-byte CELL access, TLSU route, horizontal A route, and vertical B broadcast;
6. seek backward and forward at least ten times and confirm no duplicate retire/squash burst;
7. orbit, pan with arrows/WASD, elevate with Q/E, zoom, hover, pin, and unpin;
8. confirm no building overlap, WebGL context loss, frozen animation, or continuously increasing active-instance counts;
9. switch to compatibility profile and confirm architectural semantics remain visible without bloom.

- [ ] **Step 5: Record bounded memory and draw evidence**

Use the browser performance panel to record the initial heap, heap after the 300-cycle playback, and heap after ten seeks. The report passes when heap returns to a stable band after garbage collection, active instance counts remain under their hard caps, and no WebGL resource count grows on each seek. Record DPR, quality level, bloom state, token count, packet count, beam count, and ring count in the report.

- [ ] **Step 6: Integrate reviewed branches and deploy GitHub Pages**

Use `superpowers:finishing-a-development-branch` after review. Push the SuperScalarModel work as a new reviewed branch without rewriting `origin/feat/linxsimcity-trace`. Integrate the reviewed LinxSimCity branch into `main`, push `main`, wait for the Pages workflow, and open:

```text
https://linxisa.github.io/LinxSimCity/?v=<deployed-commit>
```

Verify that the hosted manifest and topology hashes match `npm run pages:verify`, the default FA trace autoplays, and the hosted render matches the local production preview.

- [ ] **Step 7: Document evidence and commit**

The report records exact commits for LinxSimCity, SuperScalarModel, and LinxISA; test commands and exit status; trace counts/hashes; browser profile; screenshots; and any remaining limitation. Update `docs/showcase.md` with the instruction-class legend and controls.

```sh
git add docs/superpowers/reports/2026-08-14-gem5-style-instruction-effects-preview.md docs/showcase.md
git commit -m "docs: record instruction effects acceptance"
```

---

## Final Review Checklist

- [ ] Every design acceptance criterion maps to at least one task above.
- [ ] No Viewer mnemonic inference remains.
- [ ] Every detailed instruction transition contains formal classification and physical endpoints.
- [ ] All four PE-threads retain distinct halos on shared I/D Cache traffic.
- [ ] ROB, PRF, cacheline, CELL, TLSU, CUBE, retire, and squash behavior is driven by real trace identifiers.
- [ ] The instruction core, halo, trail, packets, beams, rings, and X marks use fixed-capacity instance pools.
- [ ] Bloom is selective and has a tested compatibility fallback.
- [ ] Large seek and reverse playback are deterministic and do not replay transient terminal effects.
- [ ] The public FA logical bundle, downloadable archive, Pages artifact, and repository hashes refer to the same regenerated trace.
- [ ] Local and hosted browser sessions complete without WebGL context loss or unbounded resource growth.

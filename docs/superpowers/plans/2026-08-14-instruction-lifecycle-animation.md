# LinxSimCity Instruction Lifecycle Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace event-loop decoration tokens with trace-cycle-driven instruction lifecycles, physical ROB/pipe movement, commit jumps, and squash/retire effects while preserving the Linx physical city and bounded memory use.

**Architecture:** The trace reducer retains a bounded transition history for every visible instruction. A pure motion planner maps those transitions to topology placements and routes, then a fixed set of instanced meshes renders instruction bodies and terminal effects. Request/CELL/CUBE tokens remain a separate layer so parent instructions can wait in ROB while child traffic continues.

**Tech Stack:** TypeScript 5.9, React 19, Three.js 0.185, React Three Fiber 9, Zustand, Vitest.

## Global Constraints

- Work only in `/Users/zhoubot/Documents/LinxSimCity/.worktrees/implementation`; do not implement on `main`.
- Use TDD for every behavior change and observe the expected RED before production edits.
- Run Vitest with `--maxWorkers=1`; run all heavy gates sequentially.
- Do not add dependencies or enable scene-wide shadows/Bloom for dense CELL arrays.
- Animation coordinates come from `topology.json`; no new hard-coded model geometry.
- Thread color identifies PE-thread; instruction geometry identifies operation class; event outcome is an overlay effect.
- Motion is bounded by trace cycle and terminal cycle; no independent modulo-loop token motion.
- Existing trace/checkpoint data without transition history remains loadable.

---

### Task 1: Retain Bounded Instruction Transition History

**Files:**
- Modify: `packages/trace-runtime/src/causal/types.ts`
- Modify: `packages/trace-runtime/src/causal/reduce-causal.ts`
- Modify: `packages/trace-runtime/src/causal/reduce-causal.test.ts`

**Interfaces:**
- Produces `InstructionTransition { cycle, seq, type, entityId, routeId }`.
- Adds `transitions: readonly InstructionTransition[]` to `InstructionTraceState`.
- Retains at most 24 ordered, deduplicated transitions per visible instruction.

- [x] **Step 1: Write failing reducer tests**

Assert fetch/decode/rename/dispatch/issue/pipeline/complete/ROB/retire transitions are retained in `(cycle, seq)` order, same-event duplicates are ignored, and history is capped at 24.

- [x] **Step 2: Run RED**

Run: `npx vitest run packages/trace-runtime/src/causal/reduce-causal.test.ts --maxWorkers=1`

Expected: FAIL because `InstructionTraceState.transitions` does not exist.

- [x] **Step 3: Implement minimal reducer support**

Append physical lifecycle transitions (`instruction.*`, `pipeline.enter`, and `pipeline.leave`) whenever the event has both `instruction_id` and `thread_id`; use `event.type`, `event.entity_id`, payload `route_id`, `cycle`, and `seq`. Keep the most recent 24 transitions and make deserialization default a missing transition array to `[]`. Keep cache, register, CELL, and memory child traffic in its existing causal collections so it cannot evict the parent instruction's physical-stage history.

- [x] **Step 4: Run GREEN**

Run: `npx vitest run packages/trace-runtime/src/causal/reduce-causal.test.ts --maxWorkers=1`

Expected: PASS.

---

### Task 2: Build the Pure Trace-Cycle Motion Planner

**Files:**
- Create: `packages/scene-modules/src/flow/instruction-motion.ts`
- Create: `packages/scene-modules/src/flow/instruction-motion.test.ts`
- Modify: `packages/scene-modules/src/index.ts`

**Interfaces:**
- Produces `instructionCategory(disassemblyId): InstructionCategory`.
- Produces `planInstructionMotion(instruction, cycle, topology): InstructionVisualState | undefined`.
- `InstructionVisualState` contains position, scale, thread, category, overlay, and terminal progress.

- [x] **Step 1: Write failing motion tests**

Cover topology placement lookup, orthogonal pipe interpolation, completed instruction parking in its physical ROB slot, ROB-to-retire parabolic jump, and squash scale/overlay decay.

- [x] **Step 2: Run RED**

Run: `npx vitest run packages/scene-modules/src/flow/instruction-motion.test.ts --maxWorkers=1`

Expected: FAIL because the planner module does not exist.

- [x] **Step 3: Implement minimal planner**

Use transition cycle/seq order and topology entity placement/route. Interpolate piecewise route distance for pipe movement, add `sin(pi*u)` only to inter-module travel, park completed instructions at `peN.sperob.slotM`, jump retired instructions to `peN.scalar.retire`, and keep squashed instructions at their last non-terminal physical location.

- [x] **Step 4: Run GREEN**

Run: `npx vitest run packages/scene-modules/src/flow/instruction-motion.test.ts --maxWorkers=1`

Expected: PASS.

---

### Task 3: Render Persistent Instruction Tokens and Terminal Bursts

**Files:**
- Create: `packages/scene-modules/src/flow/InstructionTokenLayer.tsx`
- Create: `packages/scene-modules/src/flow/InstructionBursts.tsx`
- Modify: `packages/scene-modules/src/flow/DataTokenLayer.tsx`
- Modify: `packages/scene-modules/src/City.tsx`
- Create: `packages/scene-modules/src/flow/instruction-layer.test.ts`

**Interfaces:**
- `InstructionTokenLayer` consumes serialized causal instructions, snapshot cycle, and topology.
- `InstructionBursts` consumes the same planned visual states and renders additive instanced red-X/red-ring or gold-ring effects.
- `DataTokenLayer` filters instruction/ROB/pipeline events and remains responsible for request/CELL/CUBE traffic only.

- [x] **Step 1: Write failing layer-selection tests**

Assert instruction lifecycle events are excluded from request tokens, one visible instruction produces one persistent visual token, thread colors remain stable, and terminal events generate the expected burst kind.

- [x] **Step 2: Run RED**

Run: `npx vitest run packages/scene-modules/src/flow/instruction-layer.test.ts --maxWorkers=1`

Expected: FAIL because lifecycle selection and burst mapping do not exist.

- [x] **Step 3: Implement fixed-capacity instanced layers**

Use one instanced mesh per instruction category, no point light per token, additive untone-mapped burst meshes, and stable instruction IDs for selection. Never allocate per-frame geometry or particle arrays.

- [x] **Step 4: Run GREEN**

Run: `npx vitest run packages/scene-modules/src/flow/instruction-layer.test.ts --maxWorkers=1`

Expected: PASS.

---

### Task 4: Extend Physical Feedback Duration and Verify the Viewer

**Files:**
- Modify: `packages/scene-modules/src/common/InstancedBoxes.tsx`
- Modify: `packages/scene-modules/src/common/colors.ts`
- Modify: relevant focused tests under `packages/scene-modules/src/`

**Interfaces:**
- Produces deterministic cycle-age color decay for PRF/cache/CELL/ROB state without per-instance timers.
- Preserves dense-instance shadow cutoff and active-state-only snapshot serialization.

- [x] **Step 1: Write failing color-decay tests**

Assert read/write/hit/miss/grant/conflict have distinct peak colors and decay to their steady color over a bounded 4–8-cycle window.

- [x] **Step 2: Run RED**

Run: `npx vitest run packages/scene-modules/src --maxWorkers=1`

Expected: FAIL because state colors do not accept trace-cycle age.

- [x] **Step 3: Implement bounded decay**

Use `lastEvent.cycle` and snapshot cycle in the color function; do not introduce timers, React state per cell, or new materials per instance.

- [x] **Step 4: Run focused and repository verification sequentially**

Run:

```sh
npx vitest run packages/trace-runtime/src packages/scene-modules/src --maxWorkers=1
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Expected: all PASS with no increase to default trace size.

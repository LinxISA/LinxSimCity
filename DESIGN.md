# Design

## Source of truth

**Status:** Active

**Updated:** 2026-09-08

**Product surfaces:** `apps/game`, `packages/brick-kit`, `packages/world`, topology and component catalog inspectors.

This document is the design authority for the LinxSimCity hard-break web game. It incorporates the product plan in GitHub issue #1, `docs/game/architecture.md`, `docs/game/hard-break.md`, the generated DavinciOO QueueGraph topology, and the current React Three Fiber implementation. The previous fixed viewer and manually arranged district scene are historical references only.

## Brand

LinxSimCity should feel like a precision industrial model of a live processor: engineered, legible, dense, and calm. Trust comes from stable hardware identity, visible provenance, explicit unknown states, and graphics that map to hardware semantics.

Avoid generic neon cubes, bloom-heavy sci-fi decoration, flat node-link diagrams, playful toy colors, and animation that implies simulator activity without evidence.

## Product goals

- Generate every module and connection from a typed topology.
- Make hierarchy, producer-to-consumer direction, queues, storage structure, and execution resources understandable at a glance.
- Let a user inspect Queue entries and Tile residency once runtime evidence is available.
- Preserve a polished topology-only mode while trace integration is paused.
- Scale from the current QueueGraph slice to the DavinciOO H3 catalog without changing the visual grammar.

The product does not provide manual placement or rewiring. It does not infer measured area, occupancy, latency, or Tile identity from scene geometry.

Success signals are: a user can distinguish Queue, Table, SRAM, ROB, and compute modules without opening the inspector; follow data-flow direction; identify occupied versus empty entries; and understand when shown state is a visual preview rather than simulator evidence.

## Personas and jobs

The primary user is a processor architect or performance engineer inspecting a topology and recorded simulation. They need to locate a module, understand its parent scope, follow queue flow, inspect storage shape and occupancy, and later correlate a visual state with a source event.

A secondary user is a model developer validating that pyCircuit or SuperScalarModel structure was imported without identity or connection loss.

## Information architecture

The game uses one workbench:

- The command bar identifies the topology and its source revision.
- The left browser switches between generated topology nodes and the H3 candidate catalog.
- The center is the read-only 3D city with a rendering-mode badge and semantic state legend.
- The right inspector shows identity, hierarchy, area evidence, parameters, source metadata, and topology connections.
- The footer states interaction controls and whether state comes from preview or trace.

Selection is shared between the tree, 3D object, and inspector. The browser never offers placement or wiring controls.

## Design principles

1. **Structure before spectacle.** Geometry must explain hardware type, hierarchy, and direction before lighting adds atmosphere.
2. **State has one meaning.** Bright entries contain data; dark gray entries are empty. Unknown runtime state is labeled and must not be presented as measured activity.
3. **Queues are transport.** SimQueue is an elevated, directional pipe corridor connecting modules, with entry chambers visible inside it.
4. **Storage shows shape.** One-dimensional Tables use a strip, multi-dimensional Tables use a grid or layered array, and ROB uses a circular buffer.
5. **Topology owns identity.** Labels, colors, layout, and preview activity never create or change hardware identity.
6. **Detail follows distance.** District color and silhouettes remain readable from afar; entry state and ports become readable at close range.

## Visual language

The scene uses a near-black blue background and restrained cyan, teal, amber, violet, and orange functional accents. Scope districts receive stable colors derived from topology ID. Queue transport uses teal; occupied generic entries use mint cyan; occupied ROB entries use amber; empty entries use charcoal gray. Input ports are cyan, outputs amber, and bidirectional ports violet.

Typography uses the system sans family for interface text and a monospaced face for IDs, revisions, counts, and mode labels. UI spacing follows a compact 4/8/12/16 px rhythm.

Modules use dark machined bases, rounded metal or ceramic shells, recessed state surfaces, selective clearcoat, and low emissive intensity. Queue pipes use glass-metal shells, internal entry capsules, structural supports, and a luminous directional core. Connections are volumetric raised tubes with visible arrows. Motion is reserved for trace-backed transfers; topology preview stays still.

## Components

- **Hierarchy district:** translucent colored slab plus wire boundary and stable scope label.
- **SimQueue:** elevated cylindrical chamber aligned with producer-to-consumer flow; capacity is sampled into bounded visible entry capsules. Occupied entries glow; empty entries remain gray.
- **Queue corridor:** raised 3D tube from module port to Queue port with a directional arrow. It replaces the old generic semitransparent line treatment.
- **Linear Table/Register File:** one row of bounded representative entries.
- **Matrix Table:** rows and columns come from catalog-declared dimension parameters; large logical arrays use representative sampling.
- **ROB:** circular entry ring with head/tail markers and amber occupied entries.
- **SRAM:** banked blocks with visible active/inactive bank treatment; bank and row counts remain parameters, not physical-area claims.
- **Compute/switch/interface modules:** distinct internal silhouettes inside a shared rounded industrial chassis.
- **State legend:** always identifies occupied and empty colors and states whether the scene is preview or trace-backed.

Visual profiles and their dimension parameter names belong to `BrickDefinition.visual`. Renderers must not infer a ROB or table shape from a display label.

## Accessibility

The interface targets WCAG 2.2 AA for HTML controls and text. Entry state uses brightness and material contrast in addition to hue. Direction uses arrow geometry in addition to color. Selection uses a wire outline and inspector synchronization.

All browser controls remain keyboard accessible with visible focus. The 3D canvas has an accessible label and is paired with the topology list for equivalent object selection. Future animated transfers must honor `prefers-reduced-motion` and offer pause/step controls.

## Responsive behavior

The primary target is a desktop engineering workstation at 1440×900 or larger. At narrower widths, the command bar simplifies and side panels may collapse while the scene remains usable. Touch uses the same orbit and selection model with larger HTML controls; hover-only information is not required.

## Interaction states

Loading states name the topology or catalog operation. Invalid topology prevents scene generation and reports the first structured diagnostic. Empty selection explains how to select an object. Selected modules and queue corridors receive a bright wire/emissive emphasis.

Until trace is connected, entry occupancy is a deterministic visual preview used to evaluate materials and silhouettes; both the scene legend and footer label it as non-simulator state. When trace state is present, the same geometry consumes explicit occupancy and entry identity. No state should silently fall back from trace to preview.

## Content voice

Use concise engineering language. Keep canonical identifiers and source names unchanged. Chinese UI copy may explain the workflow, while schema names, IDs, revisions, directions, and evidence states remain exact. Avoid game-fiction labels that obscure hardware meaning.

## Implementation constraints

The current path uses React, TypeScript, Vite, Three.js, React Three Fiber, and Drei on WebGL2. New rendering work stays in `packages/brick-kit`; derived placement stays in `packages/world`; topology and catalog data remain independent of scene coordinates.

Visual state is passed separately from topology. Large capacities use bounded representative geometry and must retain the logical capacity in labels and inspection. Connections remain 1:1 with topology edges. Queue visual elevation changes rendered coordinates and port anchors together so links remain attached after rotation.

Validation includes TypeScript, Vitest, ESLint, Prettier, production build, Pages verification, and browser screenshots at overview and close range. Rendering must dispose generated geometry through React Three Fiber lifecycle and avoid unbounded per-entry objects.

## Open questions

- [ ] Choose the first trace-backed Queue and ROB scenario after the rendering language is approved. Owner: simulation/rendering integration. Impact: replaces preview occupancy with recorded state.
- [ ] Define catalog visual profiles for the remaining DavinciOO storage structures, including true 3D arrays. Owner: component catalog. Impact: H3 expansion fidelity.
- [ ] Set LOD thresholds for entry sampling after profiling the 240-instance scene. Owner: rendering. Impact: large-scene performance.

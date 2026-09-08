# LinxSimCity game design

LinxSimCity is a browser-based chip construction and simulation game. The
player assembles typed hardware bricks in an unbounded three-dimensional
workspace, validates the design, runs a supported simulator workload, and uses
trace evidence to find queue pressure and Tile residency.

The product has one current path. The previous fixed trace-viewer UI, fixed
district renderer, v1 topology format, and v1 trace assumptions are not public
compatibility contracts. Git history preserves them.

## Core loop

1. Choose a blank workspace, blueprint, or challenge.
2. Place parameterized hardware bricks and connect compatible ports.
3. Validate ownership, connection, capacity, and backend support.
4. Run a supported workload or open a recorded run bound to this blueprint.
5. Follow transactions through queues and inspect the physical residency of a
   Tile.
6. Change the design, run it again, and compare evidence from the two runs.

## Product invariants

- Hardware identity is independent of labels, color, array order, and scene
  coordinates.
- Presentation placement is independent of the executable assembly graph.
- Every run is bound to an immutable blueprint and configuration fingerprint.
- Transaction flow and Tile residency are separate state systems joined by
  explicit trace links.
- Unknown or unobserved state remains unknown in the interface.
- Rendering interpolates recorded facts; it never advances simulation state.
- Generic bricks may be built freely, while each simulator adapter advertises
  the exact configurations it can execute.

## First playable slice

The first slice establishes the new product path with a component catalog,
blueprint model, editing history, local persistence, and a 3D workbench. It
supports Queue, Table, SRAM, and Compute bricks and leaves a typed extension
surface for the remaining DavinciOO catalog. The new trace contract and the first real
simulator link follow on the same path.

See [the architecture](docs/game/architecture.md) and
[the hard-break ledger](docs/game/hard-break.md).

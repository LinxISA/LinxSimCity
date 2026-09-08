# LinxSimCity game design

LinxSimCity is a browser-based 3D chip topology and simulation game. It reads a
typed architecture topology, generates the component city and every connection,
runs a supported simulator workload, and uses trace evidence to find queue
pressure and Tile residency.

The product has one current path. The previous fixed trace-viewer UI, fixed
district renderer, topology format, and trace assumptions are not public
compatibility contracts. Git history preserves them.

## Core loop

1. Load a model topology or choose a recorded scenario.
2. Validate component definitions, ownership, ports, and topology edges.
3. Generate a layered three-dimensional city from the topology.
4. Run a supported workload or open a recorded run bound to this topology.
5. Follow transactions through queues and inspect the physical residency of a
   Tile.
6. Change the source model or configuration, regenerate, and compare runs.

## Product invariants

- Hardware identity is independent of labels, color, array order, and scene
  coordinates.
- Every 3D connection is generated from one explicit topology edge.
- Presentation placement is derived data and never changes the topology graph.
- Every run is bound to an immutable topology and configuration fingerprint.
- Transaction flow and Tile residency are separate state systems joined by
  explicit trace links.
- Unknown or unobserved state remains unknown in the interface.
- Rendering interpolates recorded facts; it never advances simulation state.
- The browser does not add, delete, or rewire hardware nodes and edges.

## First topology slice

The first slice establishes the new product path with a component catalog,
typed architecture graph, topology validation, automatic layered layout, and a
read-only 3D explorer. It supports Queue, Table, SRAM, and Compute components
and leaves a typed extension surface for the remaining DavinciOO catalog. The
new trace contract and first real simulator link follow on the same path.

See [the architecture](docs/game/architecture.md) and
[the hard-break ledger](docs/game/hard-break.md).

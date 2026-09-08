# LinxSimCity

LinxSimCity is a browser-based 3D chip topology and simulation game. Load a
typed architecture graph and it generates the processor city, component
placement, and every connection; simulator traces then animate transactions and
Tile residency on that graph.

The repository is undergoing an intentional hard break from the previous fixed
trace viewer. The current product path is `apps/game`; the old viewer and trace
packages remain isolated only while the new trace path is implemented.

## Current topology slice

- Ten parameterized hardware component definitions with typed ports
- Stable topology identities and hardware fingerprints
- Directed connection validation with one generated 3D link per topology edge
- Stable topological sorting, longest-path X ranks, scope Z swimlanes,
  barycenter crossing reduction, and orthogonal connection routing
- Nested labeled districts generated from `parentId`, with hierarchy paths in
  the inspector
- Stable scope colors and flow-aligned transparent SimQueue pipes
- Mandatory physical-area records in square micrometres, including explicit
  unknown and aggregate evidence states
- Read-only topology import, search, selection, connection navigation, and node
  inspection
- Validation for definitions, hierarchy, parameters, endpoints, port direction,
  protocol, width, and single-producer inputs
- React Three Fiber workbench with an infinite grid and parameterized 3D
  components
- Canonical QueueGraph importer and a generated 39-node, 32-edge pyCircuit
  DavinciOO topology

The trace button is intentionally disabled until the new trace contract and
first real SuperScalarModel adapter are connected. The UI does not fabricate
runtime results.

## Run locally

Use Node.js 22 or newer.

```sh
npm install
npm run dev
```

Run the repository checks with:

```sh
npm run check
npm run build
npm run pages:verify
```

The C++ trace SDK remains separately verifiable during the trace transition:

```sh
cmake -S sdk/cpp -B build/sdk -DBUILD_TESTING=ON
cmake --build build/sdk --parallel
ctest --test-dir build/sdk --output-on-failure
```

Read [the game design](DESIGN.md),
[architecture](docs/game/architecture.md), and
[topology import](docs/game/topology-import.md) before extending the new path.
The [hard-break ledger](docs/game/hard-break.md) tracks retired surfaces.
Implementation is tracked in
[issue #1](https://github.com/LinxISA/LinxSimCity/issues/1).

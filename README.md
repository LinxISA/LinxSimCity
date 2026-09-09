# LinxSimCity

LinxSimCity is a browser-based 3D chip topology and simulation game. Load a
typed architecture graph and it generates the processor city, component
placement, and every connection; simulator traces then animate transactions and
Tile residency on that graph.

The repository is undergoing an intentional hard break from the previous fixed
trace viewer. The current product path is `apps/game`; the old viewer and trace
packages remain isolated only while the new trace path is implemented.

## Current topology slice

- Twelve parameterized hardware kinds with typed ports and declared visual profiles
- Stable topology identities and hardware fingerprints
- Directed connection validation; each SimQueue corridor retains the Queue ID
  and both producer/consumer topology edge IDs
- Queue-collapsed topological sorting, nine longest-path module ranks,
  size-aware Z packing, barycenter crossing reduction, and orthogonal routing
- Nested labeled districts generated from `parentId`, with hierarchy paths in
  the inspector
- Stable scope colors, roof-level transparent SimQueue pipes, and fluorescent
  preview packets
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
- A collapsible 7-city / 31-subsystem DavinciOO browser that locates all 240 H3
  candidates and exposes disposition, evidence, canonical-owner status, and the
  fact that catalog presence alone does not establish execution capability

The current trace schema, chunk/index/checkpoint bundle, TypeScript validator,
C++ writer, deterministic Worker reducer, and game playback controls are
implemented. The game keeps a synthetic bundle for contract tests and loads a
pinned SuperScalarModel matmul run by default for Queue, Tile residency, and
Cube lifecycle inspection. The recorded run contains 320,486 current events
over 49,822 cycles and is bound to simulator revision
`2406db2944317b8d64dc05b621f37fc9a13f8c81`. The run selector also exposes a
paired bank-conflict recording of the same workload.

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
npm run trace:verify -- fixtures/current/minimal.bundle
```

The typed local SuperScalarModel companion is documented in
[`docs/game/sim-runner.md`](docs/game/sim-runner.md). Build and test it with
`npm run runner:build` and `npm run runner:test`.

The C++ writer produces the same current bundle consumed by `simtrace`:

```sh
cmake -S sdk/cpp -B build/sdk -DBUILD_TESTING=ON
cmake --build build/sdk --parallel
ctest --test-dir build/sdk --output-on-failure
./build/sdk/write_synthetic build/cpp-current.trace-dir
npm run trace:verify -- build/cpp-current.trace-dir
```

Read [the game design](DESIGN.md),
[architecture](docs/game/architecture.md), and
[topology import](docs/game/topology-import.md) before extending the new path.
The [hard-break ledger](docs/game/hard-break.md) tracks retired surfaces.
Implementation is tracked in
[issue #1](https://github.com/LinxISA/LinxSimCity/issues/1).

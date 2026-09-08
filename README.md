# LinxSimCity

LinxSimCity is a browser-based 3D chip construction and simulation game. Build
a processor city from typed Queue, Table, SRAM, execution, arbitration, and
interconnect bricks; validate the assembly; then use simulator traces to follow
transactions and Tile residency.

The repository is undergoing an intentional hard break from the previous fixed
trace viewer. The current product path is `apps/game`; the old viewer and trace
trace packages remain isolated only while the new trace path is implemented.

## Current playable slice

- Ten parameterized hardware brick definitions with typed ports
- Stable blueprint identities and hardware fingerprints
- Chunked XYZ coordinates and quarter-turn rotations
- Place, select, rotate, connect, delete, undo, redo, import, export, and local
  autosave
- Blueprint validation for definitions, parameters, endpoints, port direction,
  protocol, width, and single-producer inputs
- React Three Fiber workbench with an infinite grid and parameterized 3D bricks

The simulation button is intentionally disabled until the new trace contract and the first
real SuperScalarModel adapter are connected. The UI does not fabricate runtime
results.

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
[hard-break ledger](docs/game/hard-break.md) before extending the new path.
Implementation is tracked in
[issue #1](https://github.com/LinxISA/LinxSimCity/issues/1).

# LinxSimCity

LinxSimCity is a WebGL trace visualizer for Linx processor and matrix-compute models. It provides a versioned trace contract, a dependency-light C++ writer, validation/packing tools, and an interactive 3D browser viewer.

## Current foundation

- Trace schema `1.0.0` with strict event ordering and stable topology IDs
- Directory and ZIP-based `.linxtrace` bundles
- C++17 `LinxSimCity::trace_sdk`
- `linxtrace validate`, `index`, `pack`, and `inspect`
- Deterministic scalar, Cache, ROB, CELL, Crossbar, CUBE, StgBufB, and TLSU fixture
- Rectangular WebGL city with a Gem5SimCity-style scalar CPU district, a ring ROB, flat 128-byte Tile Register cells, straight pipes, four long CUBE PEs, and trace-driven highlights

The [trace format guide](docs/trace-format/README.md) defines the public contract. [Event categories](docs/trace-format/events.md) and [topology identity](docs/trace-format/topology.md) provide the producer reference.

## Quick start

```sh
npm install
npm run build

cmake -S sdk/cpp -B build/sdk -DBUILD_TESTING=ON
cmake --build build/sdk --parallel
./build/sdk/write_synthetic /tmp/linxsimcity-demo.trace-dir

node tools/linxtrace/dist/main.js validate /tmp/linxsimcity-demo.trace-dir
node tools/linxtrace/dist/main.js pack \
  /tmp/linxsimcity-demo.trace-dir \
  /tmp/linxsimcity-demo.linxtrace

npm run dev --workspace @linxsimcity/viewer
```

Open the local viewer URL and drop the generated `.linxtrace` file onto the loader. Trace parsing, validation, indexing, checkpoint seek, and reduction run off the rendering thread.

## Official workload showcase

The repository includes a deterministic generator for two official SuperNPUBench workloads: a complete 256×256 FP32 matmul and a bounded 250-block FlashAttention trace. It runs the trace-enabled SuperScalarModel, validates the logical directories, packs browser-ready ZIP bundles, validates the ZIPs again, and records source/ELF/archive provenance.

See [the showcase guide](docs/showcase.md) for build prerequisites, the exact command, measured event coverage, and the documented SuperScalarModel limitation behind the FA boundary.

## Development

Use Node.js 22 or newer, then install dependencies and run the repository checks:

```sh
npm install
npm run check
```

The npm workspace includes packages under `apps/*`, `packages/*`, and `tools/*`.

Run the C++ gates separately:

```sh
cmake -S sdk/cpp -B build/sdk -DBUILD_TESTING=ON
cmake --build build/sdk --parallel
ctest --test-dir build/sdk --output-on-failure
```

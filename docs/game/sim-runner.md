# Local simulation runner

The companion runner exposes the two supported SuperScalarModel matmul
scenarios through a typed local HTTP API. It executes one configured `gfsim`
binary and one configured ELF. Requests cannot supply executable paths,
workload paths, command-line flags, shell text, or simulator configuration
keys. The service starts child processes directly with `shell: false`.

## Start the runner

The defaults point to the M5 SuperScalarModel worktree and pinned matmul ELF
documented in [benchmark.md](./benchmark.md). Override local paths through
command-line options when those artifacts are elsewhere:

```sh
npm run runner:start -- \
  --gfsim /path/to/build-current-trace/bin/gfsim \
  --model-dir /path/to/SuperScalarModel \
  --matmul-elf /path/to/matmul.elf \
  --runs-dir /path/to/linxsimcity-runs
```

Equivalent environment variables are `LINXSIMCITY_GFSIM`,
`LINXSIMCITY_MODEL_DIR`, `LINXSIMCITY_MATMUL_ELF`,
`LINXSIMCITY_MATMUL_SHA256`, `LINXSIMCITY_RUNS_DIR`, and
`LINXSIMCITY_SIMULATOR_REVISION`. The service listens on `127.0.0.1:4317` by
default. `LINXSIMCITY_RUNNER_HOST` and `LINXSIMCITY_RUNNER_PORT` change that
binding.

## API flow

1. `GET /catalog` lists allowlisted backends, workloads, scenarios, and
   parameter ranges.
2. `POST /configurations` accepts `backendId`, `workloadId`, `scenarioId`,
   and typed `parameters`. It returns the normalized immutable configuration,
   its SHA-256, and the exact allowlisted simulator overrides.
3. `POST /jobs` accepts that complete exported object. A changed or stale
   hash and altered overrides are rejected before process creation.
4. `GET /jobs/:id` returns current status, bounded stdout/stderr, failure
   diagnostics, and the result bundle after completion.
5. `POST /jobs/:id/cancel` sends `SIGTERM` to a running simulator.

The built-in `normal` scenario uses perfect CellReg service and four Cube
banks per cycle. `bank-conflict` enables real CellReg arbitration and limits
Cube service to one bank per cycle. Both parameters remain bounded by the
scenario schema. Each launch appends fixed `trace.linx_*` values so the result
manifest binds the generated run ID, simulator revision, normalized config
hash, workload identity, and actual ELF hash. A zero exit status is accepted
only when the complete bundle passes the current `simtrace` schema, file hash,
size, bounds, binding, checkpoint, and lifecycle validation and those manifest
bindings match.

Run the focused checks with:

```sh
npm run runner:build
npm run runner:test
```

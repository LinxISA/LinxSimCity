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
  --runs-dir /path/to/linxsimcity-runs \
  --allow-origin http://localhost:5173
```

Equivalent environment variables are `LINXSIMCITY_GFSIM`,
`LINXSIMCITY_MODEL_DIR`, `LINXSIMCITY_MATMUL_ELF`,
`LINXSIMCITY_MATMUL_SHA256`, `LINXSIMCITY_RUNS_DIR`, and
`LINXSIMCITY_SIMULATOR_REVISION`. The service listens on `127.0.0.1:4317` by
default. `LINXSIMCITY_RUNNER_HOST` and `LINXSIMCITY_RUNNER_PORT` change that
binding. Browser access defaults to the exact development origins
`http://localhost:5173` and `http://127.0.0.1:5173`. Repeat `--allow-origin`
to replace that list, or set the comma-separated
`LINXSIMCITY_RUNNER_ALLOWED_ORIGINS` variable. Other origins and preflights
for unsupported routes, methods, or headers are rejected.

## API flow

1. `GET /catalog` lists allowlisted backends, workloads, scenarios, and
   parameter ranges.
2. `POST /configurations` accepts `backendId`, `workloadId`, `scenarioId`,
   and typed `parameters`. It returns the normalized immutable configuration,
   its SHA-256, and the exact allowlisted simulator overrides.
3. `POST /jobs` accepts that complete exported object. A changed or stale
   hash and altered overrides are rejected before process creation.
4. `GET /jobs/:id` returns current status, bounded stdout/stderr, failure
   diagnostics, and the result bundle after completion. A successful result
   includes `bundleBaseUrl`, such as `/jobs/<id>/bundle/`.
5. `POST /jobs/:id/cancel` sends `SIGTERM` to a running simulator.
6. Read `manifest.json`, `topology.json`, and `index.json` relative to
   `bundleBaseUrl`. Chunk and checkpoint paths in `index.json` use the same
   base URL, allowing the browser trace reader to open it as an HTTP directory.

The built-in `normal` scenario uses perfect CellReg service and four Cube
banks per cycle. `bank-conflict` enables real CellReg arbitration and limits
Cube service to one bank per cycle. Both parameters remain bounded by the
scenario schema. Each launch appends fixed `trace.linx_*` values so the result
manifest binds the generated run ID, simulator revision, normalized config
hash, workload identity, and actual ELF hash. A zero exit status is accepted
only when the complete bundle passes the current `simtrace` schema, file hash,
size, bounds, binding, checkpoint, and lifecycle validation and those manifest
bindings match. Bundle responses are read-only and use `Cache-Control:
no-store`. Compressed chunks and checkpoints retain their original gzip bytes
and include `Content-Encoding: gzip`. Only successful jobs are readable, and
only the root JSON files plus chunk and checkpoint paths named by the bundle
index are served. Real-path containment prevents traversal and symlink escape.

Successful results also contain `metrics`, bound to the run ID, normalized
configuration hash, topology fingerprint, and workload hash. `cycles`, queue
backpressure event count, and Tile read/write/move count come from the fully
validated trace. Bank-conflict cycles and non-winner wait cycles come from the
final bounded `gfsim` PMU output. The runner keeps only the final 64 KiB of
stdout/stderr. If a PMU field is absent, its metric remains absent so challenge
evaluation reports insufficient evidence instead of using an invented value.

Run the focused checks with:

```sh
npm run runner:build
npm run runner:test
```

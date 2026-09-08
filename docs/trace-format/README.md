# LinxSimCity simulation trace

The current game trace contract is `linxsimcity.trace` with schema version `1`.
It binds every run to one topology fingerprint, simulator revision and config,
workload, time-domain set, observation capability set, event window, and loss
record.

The contract covers manifest and event semantics plus chunked gzip storage,
hash-bound indexes, and recoverable checkpoints. Worker replay and game UI
integration are implemented in M4. The old fixed-viewer bundle reader is
isolated from `apps/game` and is not a compatibility path for this contract.

## Lossless values and ordering

Cycles, addresses, allocation epochs, Tile versions, event counts, and other
unsigned 64-bit values are canonical decimal strings. JSON numbers are rejected
for these fields, including values that appear small enough for JavaScript.

Events are ordered independently within each declared time domain by:

```text
(cycle, phase, sequence)
```

Phase order is `work → xfer → commit → async`. Duplicate keys and backward
movement are invalid. Cross-domain event order is not inferred; each domain's
`tickRatio` supplies the later correlation boundary.

## Manifest

The manifest records:

- `runId` and exact `topologyFingerprint`;
- simulator name, revision, and configuration SHA-256;
- workload name and SHA-256;
- time domains and rational tick ratios;
- inclusive cycle window and whether it begins from reset;
- exact event count and observation capabilities;
- dropped-event count, truncation state, and required reason when loss exists.

A window marked complete cannot report truncation or dropped events.

## Event families

| Family      | Events                                                                 | Contract                                                                                |
| ----------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Queue       | `write-attempt`, `accept`, `visible`, `read`, `backpressure`, `cancel` | Acceptance and visibility remain distinct; occupancy cannot exceed capacity             |
| Tile        | `allocate`, `read`, `write`, `move`, `release`                         | Logical Tile/version and physical residency/allocation epoch are independent identities |
| Association | `link.associate`                                                       | Joins transaction tokens to Tile production, consumption, or transfer                   |
| Compute     | `start`, `complete`                                                    | Binds operation and input/output Tile identities to a token                             |
| Run control | `reset`, `flush`                                                       | Clears or terminates the explicitly named runtime identities                            |

Queue and Tile events reference topology node IDs. A producer, consumer,
storage node, or event entity missing from the bound topology is invalid.

## Tile residency

`tile.allocate` creates a unique `residencyId` carrying:

- logical `tileId` and `version`;
- physical `storageNodeId` and `allocationEpoch`;
- optional bank, row, slot, and address coordinates;
- byte range and fragment index/count.

Read/write events require an active matching residency. Move ends one residency
and starts another. Release ends the residency. Reusing a residency without a
matching terminal event is invalid when the window starts from reset.

## Schema and fixtures

- TypeScript contract: `packages/trace-schema/src/current-*.ts`
- JSON Schema: `packages/trace-schema/schema/linxsimcity-trace.schema.json`
- Bundle JSON Schema:
  `packages/trace-schema/schema/linxsimcity-trace-bundle.schema.json`
- Positive flow: `fixtures/current/minimal.run.json`
- Chunked positive bundle: `fixtures/current/minimal.bundle/`
- Negative matrix: `fixtures/current/negative-cases.json`

The negative matrix covers old-format input, number-coerced u64 values, invalid
configuration hashes, topology mismatch, ordering and duplicate keys, queue
read before visibility, duplicate Tile allocation, missing topology entities,
missing capabilities, and a complete window that claims event loss.

Validate the positive fixture against its bound topology with:

```sh
npm run trace:verify -- \
  fixtures/current/minimal.run.json \
  fixtures/current/minimal.topology.json
```

## Current bundle

A directory bundle contains exactly the current public storage path:

```text
manifest.json
topology.json
index.json
chunks/<domain>-<ordinal>.jsonl.gz
checkpoints/<domain>-<ordinal>.json.gz
```

`index.json` uses schema `linxsimcity.trace-index` version `1`. Every chunk
records its time domain, inclusive cycle bounds, decimal-string event count,
compressed byte size, SHA-256, and nearest preceding checkpoint ID. Every
checkpoint index entry records a decimal-string cycle and global event ordinal,
compressed size, and SHA-256.

A checkpoint uses schema `linxsimcity.trace-checkpoint` version `1` and binds
the same run ID and topology fingerprint. Its strict reducer state contains
Queue tokens and occupancy, Tile residencies, token/Tile associations, and
in-flight computations. Versions, allocation epochs, cycles, addresses, and
event ordinals remain lossless decimal strings.

Validate all files, hashes, bindings, chunk bounds, checkpoint state, and event
semantics with:

```sh
npm run trace:verify -- fixtures/current/minimal.bundle
```

The C++ SDK example emits the same format and is cross-validated by CI:

```sh
cmake -S sdk/cpp -B build/sdk -DBUILD_TESTING=ON
cmake --build build/sdk --parallel
./build/sdk/write_synthetic build/cpp-current.trace-dir
npm run trace:verify -- build/cpp-current.trace-dir
```

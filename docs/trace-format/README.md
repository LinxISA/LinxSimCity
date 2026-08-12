# Linx Trace Format 1.0

LinxSimCity reads a versioned logical trace bundle. A bundle is either a directory or a ZIP container with the `.linxtrace` extension. Both forms contain the same entries and must produce the same validation result.

## Bundle layout

```text
manifest.json
topology.json
strings.json
index.json
chunks/000000.jsonl.gz
checkpoints/000000.json.gz
```

| Entry                   | Purpose                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| `manifest.json`         | Version, model, profile, cycle bounds, counts, and chunk/checkpoint spans    |
| `topology.json`         | Stable hardware entities, hierarchy, capacity, ports, and placement hints    |
| `strings.json`          | String dictionary with non-empty string keys and string values               |
| `index.json`            | Per-chunk cycle bounds, count, compressed size, SHA-256, and checkpoint path |
| `chunks/*.jsonl.gz`     | Gzip-compressed event envelopes, one JSON object per line                    |
| `checkpoints/*.json.gz` | Gzip-compressed reducer state at a checkpoint boundary                       |

`linxtrace pack` writes entries in lexical order. Entries already ending in `.gz` use ZIP STORE mode so the ZIP layer does not recompress them.

## Manifest

| Field                      | Type         | Rule                                                       |
| -------------------------- | ------------ | ---------------------------------------------------------- |
| `schemaVersion`            | string       | Semantic version; readers in this release accept major `1` |
| `modelVersion`             | string       | Non-empty model build or commit identifier                 |
| `profile`                  | string       | `overview`, `pipeline`, or `forensic`                      |
| `firstCycle`, `lastCycle`  | safe integer | Inclusive bounds; `lastCycle >= firstCycle`                |
| `eventCount`, `chunkCount` | safe integer | Non-negative totals                                        |
| `chunkCycleSpan`           | safe integer | Positive; default `4096`                                   |
| `checkpointCycleSpan`      | safe integer | Positive; default `4096`                                   |

Chunks cannot cross a `chunkCycleSpan` bucket. A chunk at cycle `c` uses `chunks/{floor(c / chunkCycleSpan), 6 digits}.jsonl.gz`. Its index entry points to the nearest preceding checkpoint bucket.

## Ordering and integrity

- Event order is strictly increasing by `(cycle, seq)` across the entire bundle.
- Every `entity_id` resolves to one topology entity.
- Each index hash is lowercase hexadecimal SHA-256 of the compressed chunk bytes.
- `compressedBytes`, `eventCount`, and cycle bounds match the referenced chunk.
- A checkpoint stores its boundary `cycle`, `seq: 0`, and an entity-state dictionary.

The CLI validates incrementally and enforces bundle-wide entry, byte, chunk, and event limits.

## Profiles

| Profile    | Intended content                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `overview` | Module occupancy, major transfers, stalls, flushes, and user markers                                           |
| `pipeline` | Overview plus instruction stages, queues, ROB, cache, CELL, Crossbar, CUBE, Vector, StgBufB, and TLSU activity |
| `forensic` | Pipeline content plus implementation-specific addresses, request IDs, and diagnostic payload fields            |

Profiles change event detail, not ordering, topology identity, or container rules.

## Compatibility

Readers accept `1.x.y`. Producers may add optional payload fields in a minor release; readers preserve unknown payload fields. Event envelope fields and metadata objects remain strict. A new required field, incompatible event meaning, or container change requires a new major version.

## CLI

```bash
node tools/linxtrace/dist/main.js validate trace-dir --json
node tools/linxtrace/dist/main.js inspect trace.linxtrace
node tools/linxtrace/dist/main.js index trace-dir
node tools/linxtrace/dist/main.js pack trace-dir trace.linxtrace
```

| Exit code | Meaning                                                   |
| --------- | --------------------------------------------------------- |
| `0`       | Command completed; validation passed                      |
| `1`       | Command usage, filesystem, archive, or execution failure  |
| `2`       | Bundle opened successfully but contract validation failed |

See [events.md](events.md) for event categories and [topology.md](topology.md) for entity identity.

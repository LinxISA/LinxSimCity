# Hard-break ledger

This ledger controls replacement of the previous viewer. A row is deleted only
after its replacement protects the listed invariant. `pending` means the code
still exists even when it is no longer the default path.

| Previous surface                                            | Current state (2026-09-08)                                                                                                     | Deletion point                                                                                                                 | Replacement owner                                 | Invariant retained                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/viewer` entry point                                   | Pending. `apps/game` is the root dev, build, and Pages entry, but `apps/viewer` remains in the workspace.                      | M8, after game E2E, current-format real-run replay, and Pages smoke checks cover the old duties.                               | `apps/game`                                       | The site builds and opens a useful first screen; selection, errors, and cycle evidence remain accessible. |
| `packages/scene-modules` fixed districts and routes         | Pending. The game renders through `packages/brick-kit`; the old package and tests remain.                                      | M8, after M2 visual tests and M5 real-run inspection cover picking, module state, and data motion.                             | `packages/brick-kit`, `packages/scene-core`       | Stable picking identity, scalable rendering, and declared-route-only motion.                              |
| `linx-city-v1` fixed layout and blueprint/editor behavior   | Removed from the game path. Topology is the only node and connection authority; no compatibility switch exists.                | Delete residual fixtures/docs in the M8 hard-break audit.                                                                      | `packages/world`                                  | Typed ports, stable IDs, topology diagnostics, and finite valid coordinates.                              |
| Previous trace UI assumptions in `packages/trace-runtime`   | Pending. The old bundle reader, reducer, Worker protocol, and event assumptions still exist alongside the current schema work. | M4 replaces reduction/seek; M8 removes the final compatibility reader and old fixtures after oracle/E2E coverage passes.       | `packages/trace-runtime`, `packages/trace-schema` | Deterministic ordering, checkpoint seek, source binding, Queue lifecycle, and Tile identity.              |
| `tools/linxtrace` and `sdk/cpp` legacy writer               | Pending. They are source evidence only and do not produce the current contract.                                                | M1/M5 add the current writer/producer; M8 deletes legacy-only commands after the pinned workload is regenerated and validated. | `tools/simtrace`, simulator adapter, `sdk/cpp`    | Reproducible producer revision/config/workload binding and independently validated events.                |
| Bundled FA viewer default and `apps/viewer/public/traces/*` | Pending and excluded from the game default. The data uses the old format.                                                      | M5 replaces the default with a pinned current-format real run; M8 removes old bundles.                                         | simulator adapter, `apps/game`                    | Real data is labeled, reproducible, and distinct from synthetic preview activity.                         |
| Viewer-specific HUD, timeline, inspector, and diagnostics   | Pending with `apps/viewer`; `apps/game` already owns topology browsing and selection.                                          | M8 after current trace playback, mismatch diagnostics, and Tile inspection land in M4/M5.                                      | `apps/game`                                       | Search, selection, diagnostics, cycle evidence, and source status remain available.                       |
| Legacy screenshots and superseded design plans              | Historical files remain and are not acceptance evidence for the game.                                                          | Replace active references during M2/M5; remove stale links in the M8 audit.                                                    | `docs/game`                                       | Current documents describe the shipped product and historical material is labeled.                        |

There is one public product path and one current contract. Unsupported blueprint
or trace inputs fail with a direct diagnostic; no automatic legacy reader is
added.

## First evidence target

The pinned M0 source and workload are recorded in
[`benchmark.md`](./benchmark.md). M5 must regenerate that run in the current
format and show an accepted Queue transfer, a storage allocation with physical
bank/row/slot, a compute event, and writeback. Missing observation points are
implemented in the producer rather than inferred in the browser.

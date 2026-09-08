# Hard-break ledger

This ledger controls replacement of the previous viewer. A row may be removed
only after its replacement protects the listed invariant.

| Previous surface                         | Disposition                                                                      | Replacement owner    | Invariant retained                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------- |
| `apps/viewer` entry point                | Retire from build and Pages immediately; delete after the new trace path is live | `apps/game`          | The site builds and opens a useful first screen         |
| `packages/scene-modules` fixed districts | Remove after brick-kit parity for the first real trace                           | `packages/brick-kit` | Stable picking identity and scalable rendering          |
| `linx-city-v1` fixed district layout     | Unsupported in the game path                                                     | `packages/world`     | Finite, valid coordinates and explicit routes           |
| Previous trace UI assumptions            | Keep isolated until the current reducer lands, then delete                       | trace packages       | Deterministic ordering, checkpoint seek, source binding |
| Bundled FA viewer default                | Remove from Pages now; regenerate a current-format real-run fixture              | simulator adapter    | Real data is marked and reproducible                    |
| Viewer-specific HUD and inspector        | Delete with old app                                                              | `apps/game`          | Selection, errors, and cycle evidence remain accessible |
| Legacy screenshots and design plans      | Keep only when labeled historical; otherwise replace                             | `docs/game`          | Current docs describe the shipped product               |

There is no runtime legacy switch, compatibility reader, or second public app.
Unsupported old blueprint and trace inputs must fail with a direct diagnostic.

## First evidence target

The first real vertical slice will use the SuperScalarModel revision selected
by its integration work and a bounded request-to-writeback workload. It must
show one accepted queue transfer, one storage allocation with physical
bank/row/slot, one compute event, and one writeback. Missing observation points
are implemented in the producer rather than inferred in the browser.

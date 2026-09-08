# Guided challenges

`@linxsimcity/scenarios` defines three M7 challenges against one pinned
SuperScalarModel workload and the M5 trace topology. A challenge declaration
fixes its backend, workload SHA-256, topology fingerprint, starting
configuration, permitted parameter range, required trace capabilities, guided
steps, observable metrics, and completion rule.

| Challenge                   | Fixed start                          | Permitted change                                    | Required measured result                                                               | Completion                                                                    |
| --------------------------- | ------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Explain the traced topology | normal arbitration, four banks/cycle | none                                                | cycles, Tile transfers                                                                 | Complete lossless run with Queue, Tile, association, and compute capabilities |
| Locate Queue backpressure   | real arbitration, one bank/cycle     | none                                                | cycles, Queue backpressure cycles, wait cycles                                         | Backpressure and wait totals are both non-zero                                |
| Reduce bank conflicts       | real arbitration, one bank/cycle     | `cellPerfectMode=false`; `cubeMaxBankPerCycle=2..8` | cycles, bank-conflict cycles; waits and Tile transfers are also displayed when present | At least 10% fewer bank-conflict cycles and fewer total cycles                |

The challenge API is pure. `evaluateChallenge` evaluates either single-run
challenge from a run configuration, its current trace manifest, and a bound
`linxsimcity.run-metrics` record. `evaluateImprovementChallenge` compares the
fixed one-bank baseline with a rerun. It accepts a comparison only when both
runs retain the pinned workload and topology. Each manifest configuration hash
must match its supplied configuration, so changing a parameter immediately
makes the previous result `stale-run` until the simulator produces a newly
bound bundle.

Metrics use decimal u64 strings and are limited to simulator-observable values:
total cycles, Queue backpressure cycles, bank-conflict cycles, wait cycles, and
Tile transfer count. A metrics record names its source as simulator PMU or a
validated trace aggregate and binds its values to the run ID, configuration
hash, topology fingerprint, and workload hash. Rendering frame counts,
animation speed, interpolated token motion, and UI interaction counts are not
challenge evidence.

The current trace manifest does not contain PMU summary metrics. Loading a
bundle without a separately bound metrics record therefore returns
`insufficient-evidence`; the evaluator does not derive or guess success from
the window length, event count, or animation. Truncated runs, dropped events,
missing trace capabilities, missing metrics, malformed decimal u64 values, and
metrics copied from another run also return `insufficient-evidence` with a
specific diagnostic.

The three recorded evidence sets under `apps/game/public/runs` currently pass
their challenge evaluators. The fixed improvement changes Cube bank service
from one to two banks per cycle: cycles fall from 68,785 to 68,098 and measured
bank-conflict cycles fall from 362,905 to 111,617. These values come from the
bound `metrics.json` records and the matching validated bundles.

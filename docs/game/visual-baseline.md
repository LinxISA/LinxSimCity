# M0 visual baseline

## Operable scene

The review scene is the topology-driven game at
`http://127.0.0.1:5173/`, loaded from
`apps/game/public/topologies/davincioo-queue-model.json`. It contains 39
topology nodes and 32 edges. Fourteen Queue nodes are selectable transparent
corridors; they are not separate buildings. Hierarchy selection focuses the
same stable topology ID in 3D.

| View     | Stable node ID           | Visual acceptance condition                                                                                                                                                                         |
| -------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview | `scope.root`             | All ranks are legible, leaf buildings do not overlap, hierarchy plates use stable restrained colors, and topology reads left-to-right.                                                              |
| Queue    | `queue.q005.cube`        | Selection labels the Queue; the glass corridor joins its declared producer and consumer at roof height; arrow and fluorescent packets move producer-to-consumer; zero occupancy produces no packet. |
| Table    | `block.b002.scheduled`   | The Dependency Window reads as a two-dimensional entry matrix; occupied entries glow and empty entries remain graphite gray.                                                                        |
| ROB      | `block.b013.ordered`     | The Reorder Window reads as a circular buffer with distinct head/tail markers and individually visible lit/empty entries.                                                                           |
| Vector   | `block.b006.vector.done` | Eight MAC cells form one linear row and pulse in a directional sequence without obscuring the label.                                                                                                |
| Cube     | `block.b008.cube.done`   | A 4×4 systolic array is recognizable; individual PEs pulse with row/column phase and remain separately visible.                                                                                     |
| TMA      | `block.b009.tma.done`    | TMA controller, four memory channels, and DDR stack are distinct; fluorescent access packets travel in request/return directions.                                                                   |

Across close-ups, ports meet the Queue corridor without a vertical jog, labels
remain readable, selection is visible by shape/outline as well as color, and
emission does not erase entry boundaries. Preview activity is explicitly
labeled preview; it is not presented as real trace data.

## 2026-09-08 manual review record

The scene was operated manually in the Codex in-app browser. The overview
loaded from the canonical QueueGraph, hierarchy selection focused the matching
module, Queue selection focused and labeled the corridor, Table and ROB entries
were readable, Vector and Cube arrays animated, and TMA showed four DDR channels
with moving access packets. Queue/module activity was the bounded visual
preview, so this record proves only that the small scene was operable and its
composition could be reviewed.

The in-app browser viewport was not locked to 1440×900 and this check did not
run in the pinned Chrome 152 environment. It therefore does not prove the fixed
browser/viewport baseline, trace correctness, screenshot stability, or
performance. Chrome 152.0.7977.76 at 1440×900 DPR 1 remains the benchmark target
in [`benchmark.md`](./benchmark.md). Automated screenshot coverage and
`npm run test:visual` remain M2 deliverables and must supply that evidence.

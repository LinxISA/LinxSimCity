# Visual baseline and capture evidence

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

## Reproducible capture

Start the game server in one terminal, then run the browser harness from the
repository root:

```sh
npm run dev -- --host 127.0.0.1
node scripts/visual/harness.mjs \
  --url http://127.0.0.1:5173/ \
  --output build/visual-evidence
node scripts/visual/harness.mjs --check build/visual-evidence
```

Set `CHROME_BIN` to an executable Chrome or Chromium binary when it is not in a
standard macOS or Linux location. The harness fails when it cannot find a
browser, create a WebGL canvas, operate a required view, load the bank-conflict
bundle, or capture exactly 1440×900 at DPR 1. Browser absence never becomes a
skipped or passing visual check.

The CDP sequence captures these viewport images:

1. `01-overview.png` after the topology and WebGL canvas are ready.
2. `02-h3-expanded.png` after opening the first H1 and H2 catalog branches.
3. `03-selected-inspector.png` after selecting the first visible node in the
   topology tree.
4. `04-bank-conflict-run.png` after the recorded Bank Conflict bundle reaches
   its playback UI.

`build/visual-evidence/manifest.json` records the source URL, UTC capture time,
browser product/revision/user agent/executable, viewport, human-readable action
for every image, PNG dimensions, and SHA-256. `--check` reads existing evidence
without launching Chrome and rejects missing views, renamed or escaping paths,
non-PNG files, dimensions other than 1440×900, manifest/IHDR disagreement, and
hash changes. The committed fixture in `tests/fixtures/visual-harness` exercises
this check without requiring a browser in unit tests.

The manifest makes a capture attributable and detects accidental replacement;
it is not a pixel-diff oracle. Animated WebGL packets and module activity may
be in a different phase across captures, so visual acceptance still evaluates
the scene conditions in the table above.

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
in [`benchmark.md`](./benchmark.md). The CDP harness above is the authoritative
way to create and verify the fixed-size M2 evidence; this historical manual
record remains limited to operability and composition.

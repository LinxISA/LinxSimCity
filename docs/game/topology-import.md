# pyCircuit topology import

LinxSimCity consumes the canonical Agentic Circuit QueueGraph plan produced by
pyCircuit. It does not inspect Python source text or infer connections from
names.

The checked-in default topology is generated from
`examples/agentic-circuit/pipelines/davincioo_queue_model.py`. The canonical
pipeline first freezes the model to ACIR, then emits QueueGraph JSON. The
LinxSimCity importer converts that plan as follows:

- every QueueGraph scope becomes a hierarchical container;
- every block becomes a typed component matched by block kind;
- every `SimQueue` becomes an explicit Queue component with depth, latency,
  rate, scope, and exact payload type metadata;
- every producer-to-queue and queue-to-consumer relationship becomes one
  topology edge;
- every block and queue receives an explicit `area` record. QueueGraph carries
  no physical PPA area, so these records are `unknown` rather than invented;
  scope containers are unresolved `aggregate` records;
- unsupported block kinds, duplicate queue names, missing producers, invalid
  ports, and unsupported plan versions fail closed.

Regenerate the default topology from a pyCircuit checkout with its LLVM 22
Agentic Circuit tools already built:

```sh
PYCIRCUIT_ROOT=/path/to/pyCircuit \
  bash scripts/generate-davincioo-topology.sh
```

The output is
`apps/game/public/topologies/davincioo-queue-model.json`. Its source record
binds the pyCircuit Git revision, complete-plan SHA-256, source-model SHA-256,
plan schema/version, whole-worktree dirty status, and whether the relevant
model/tooling inputs were dirty.

The current executable QueueGraph is a building-block model with source,
frontend transform, dependency window, four-way route, scalar/vector/cube/TMA
transforms, merge, reorder, observation taps, and sink. It is real generated
topology evidence, but it is not the full 240-candidate DavinciOO hierarchy or
a Tile-storage trace. Those are separate later inputs and must not be inferred
from this plan.

## DavinciOO 240-candidate catalog

The H3 catalog is a separate non-executable artifact. Regenerate it from the
committed Git tree of a pyCircuit checkout, even when its working tree contains
unrelated changes:

```sh
PYCIRCUIT_ROOT=/path/to/pyCircuit \
  bash scripts/generate-davincioo-catalog.sh
```

The generator reads `catalog.json` and the path manifest from the same captured
commit. Each entry records H1/H2/H3 identity, representation, recommendation,
ports and their evidence status, reported snapshot execution status, whether
the proposed source actually exists in that commit, matching committed test
paths, unresolved ownership, and an explicit unknown area record. The mapping
authority string states that the artifact is not execution topology.

Source/test path presence is reported independently from the catalog snapshot's
`execution_status`. For example, I1 and I2 have committed source and test paths
at the captured revision while the catalog still reports them as not
implemented and their disposition remains `review`. LinxSimCity preserves that
disagreement for review; it does not promote either candidate to executable
topology or silently overwrite the source status.

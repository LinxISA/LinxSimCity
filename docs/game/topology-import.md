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

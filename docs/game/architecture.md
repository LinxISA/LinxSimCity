# Game architecture

## Ownership boundaries

| Area              | Owns                                                                     | Does not own                           |
| ----------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| Component catalog | Component definitions, parameters, ports, source provenance              | Instantiated topology or runtime state |
| World             | Architecture topology validation, generated instances, links, and layout | Simulation or rendering                |
| Brick kit         | Parameterized Three.js representation and picking                        | Hardware identity or model behavior    |
| Game app          | Topology import, search, selection, inspection, and trace controls       | Simulator truth                        |
| Trace runtime     | Deterministic event reduction, checkpoints, causal indexes               | Animation time or camera state         |
| Simulator adapter | Topology export and trace production                                     | Free-form code execution               |

The dependency direction is:

```text
component-catalog <- world <- game
component-catalog <- brick-kit <- game
trace-schema <- trace-runtime <- game
```

Neither the catalog nor the world package imports React or Three.js. Hardware
contracts remain testable without a browser, and display objects cannot become
the source of identity.

## Topology and generated world

An architecture topology contains:

- one schema and schema version;
- stable node IDs referring to stable component definition IDs;
- hierarchy and per-node parameters;
- directed edges between concrete typed ports;
- a source revision that binds the graph to model evidence.

Validation reports every duplicate node, missing definition, invalid parameter,
invalid parent, incompatible edge, missing endpoint, and duplicate input
binding. The generator produces scene instances and links only from a valid
topology. There is no UI operation that creates, deletes, or rewires an edge.

The initial layout assigns graph layers from dependency order. Nodes in the
same layer receive deterministic positions ordered by stable ID. Cyclic nodes
remain renderable in deterministic trailing layers. Layout is derived data and
is excluded from the topology fingerprint.

## Coordinate model

Generated placement uses an integer chunk plus an integer position inside the
chunk. `normalizeAxis` keeps the local component in `[0, chunkSize)` for all
three axes. Rendering converts those logical coordinates to Three.js numbers.
The representation supports the large-coordinate and camera-relative work
planned for later milestones without making placement authoritative.

## Run boundary

A future run manifest binds simulator revision, workload, configuration,
topology fingerprint, observation capabilities, event window, and truncation
status. A run whose topology fingerprint differs from the open world is stale
and cannot supply current performance results.

The browser may always inspect a valid topology. Execution requires an adapter
that supports its components and parameters. Static hosting loads recorded runs;
it does not pretend to run a local simulator.

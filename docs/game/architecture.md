# Game architecture

## Ownership boundaries

| Area              | Owns                                                                | Does not own                        |
| ----------------- | ------------------------------------------------------------------- | ----------------------------------- |
| Component catalog | Brick definitions, parameters, ports, source provenance             | Placed instances or runtime state   |
| World             | Blueprint instances, connections, display transforms, serialization | Editing history or simulation       |
| Editor            | Commands, selection, connection draft, undo and redo                | Render objects or trace reduction   |
| Brick kit         | Parameterized Three.js representation and picking                   | Hardware identity or model behavior |
| Game app          | Player workflow, panels, input routing, local persistence           | Simulator truth                     |
| Trace runtime     | Deterministic event reduction, checkpoints, causal indexes          | Animation time or camera state      |
| Simulator adapter | Supported configuration export and trace production                 | Free-form code execution            |

The dependency direction is:

```text
component-catalog <- world <- editor <- game
component-catalog <- brick-kit <- game
trace-schema <- trace-runtime <- game
```

Neither the catalog nor the world package imports React or Three.js. This
keeps hardware contracts testable without a browser and prevents display
objects from becoming the source of identity.

## Coordinate model

Logical placement uses an integer chunk plus an integer position inside the
chunk. `normalizePosition` keeps the local component in `[0, chunkSize)` for
all three axes. Rendering subtracts a camera-relative logical origin before
converting to Three.js numbers. The first implementation supports ±1,000,000
scene units exactly and keeps the representation suitable for larger ranges.

Rotation is stored as quarter turns. The logical model never serializes Euler
floating-point drift.

## Blueprint model

A blueprint contains:

- one schema and schema version;
- stable instance IDs referring to stable definition IDs;
- logical transforms and per-instance parameters;
- typed links between concrete instance ports;
- display metadata that may change without changing hardware connectivity.

Validation reports every duplicate instance, missing definition, invalid
parameter, incompatible link, missing endpoint, and duplicate input binding.
The validator does not silently repair input.

## Run boundary

A future run manifest binds simulator revision, workload, configuration,
blueprint fingerprint, observation capabilities, event window, and truncation
status. A run whose blueprint fingerprint differs from the open world is stale
and cannot supply current performance results.

The browser may always build and inspect. Execution requires an adapter that
supports the selected components and parameters. Static hosting loads recorded
runs; it does not pretend to run a local simulator.

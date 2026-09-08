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

The initial layout calculates dependency layers, then uses them to order
siblings inside each parent. Stable IDs break ties. Cyclic nodes remain
renderable in deterministic trailing positions. Layout is derived data and is
excluded from the topology fingerprint.

## Hierarchy rendering

`parentId` is the only hierarchy authority. A parent must exist and must use a
container definition; parent cycles are rejected. The generated world records a
depth for every instance, measures container bounds from its immediate
children, and places each child on the next raised level. The renderer draws
containers as labeled district plates and ordinary modules as buildings inside
those plates. The topology inspector uses the same parent chain, so the tree,
3D districts, and selected-node path cannot disagree.

Graph dependency order controls stable ordering within each parent. It never
moves a child outside its declared parent to make an edge shorter. Cross-scope
edges remain visible between district plates.

## Physical area

Every topology node carries one physical-area record:

```json
{
  "value": 12500,
  "unit": "um2",
  "status": "measured",
  "source": "ppa-report:sha256-or-stable-reference"
}
```

The only storage unit is square micrometres. `measured` and `estimated` require
a positive value and source. `unknown` requires `value: null`. Hierarchy
containers use `aggregate`; they receive a numeric value only when their child
areas can be completely and honestly aggregated.

Physical area does not silently control the current schematic layout. The 3D
component footprint remains a readable logical representation until a later
physical-floorplan mode explicitly opts into area-weighted geometry.

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

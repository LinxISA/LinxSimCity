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

The layout first removes hierarchy-only containers from the data-flow graph and
runs a stable Kahn topological sort. Longest-path rank becomes the X-axis: every
producer is left of its consumer. Stable IDs break ties, so shuffled source JSON
produces the same order. Cyclic nodes are reported by the sorter and placed in a
deterministic trailing rank rather than being silently treated as acyclic.

Within each rank, four forward/backward barycenter sweeps use predecessor and
successor positions to reduce edge crossings. Parent scope becomes a Z-axis
swimlane. Node dimensions determine rank spacing and lane height, preventing
adjacent buildings from overlapping. Layout is derived data and is excluded
from the topology fingerprint.

## Hierarchy rendering

`parentId` is the only hierarchy authority. A parent must exist and must use a
container definition; parent cycles are rejected. After graph nodes have been
placed in ranks and scope lanes, container bounds are calculated bottom-up from
their immediate children. Each hierarchy depth receives a raised Y level. The
renderer draws containers as labeled district plates and ordinary modules as
buildings inside those plates. The topology inspector uses the same parent
chain, so 3D districts and the selected-node path cannot disagree.

Each district receives a stable color derived from its topology ID. The root
uses a neutral graphite-blue; child scopes use a restrained categorical palette
with translucent fills and matching labels. Color is presentation metadata and
does not enter the topology fingerprint or imply area, latency, or ownership.

The sorter never changes `parentId` to make an edge shorter. Cross-scope edges
remain visible between district plates and use orthogonal X/Y/Z routes. Small
per-edge routing heights keep coincident links distinguishable while preserving
their exact endpoints.

`SimQueue` is rendered as a transparent pipe rather than a building. Its local
positive X axis is the transfer direction. The world generator calculates a
continuous Y-axis angle from the average producer position to the average
consumer position; one-sided boundary queues point toward or away from their
known neighbor. Input/output rings and line anchors use the same rotation, so
the pipe body, direction chevrons, and topology edges stay aligned.

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

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

The layout removes hierarchy-only containers and folds every Queue node into
its producer-to-consumer relationship before running a stable Kahn topological
sort. Longest-path rank becomes the X-axis: every acyclic producer is left of
its consumer. Stable IDs break ties, so shuffled source JSON produces the same
order. Cyclic nodes are reported and placed in a deterministic trailing rank.

Within each rank, four forward/backward barycenter sweeps reduce crossings.
Hierarchy provides only the stable initial tie order; it does not reserve a
fixed scope swimlane. Each rank uses the largest module width, and nodes are
packed on Z using their individual depth plus a fixed gap. The result is a
compact, module-size-aware layout without overlapping leaf bounds. Layout is
derived data and is excluded from the topology fingerprint.

## Hierarchy rendering

`parentId` is the only hierarchy authority. A parent must exist and must use a
container definition; parent cycles are rejected. After graph nodes have been
placed, container bounds are calculated bottom-up from their immediate
children. Containers are thin, labeled district plates at the ground plane;
ordinary modules are buildings inside those bounds. The inspector uses the same
parent chain, so 3D districts and the selected-node path cannot disagree.

Each district receives a stable color derived from its topology ID. The root
uses a neutral graphite-blue; child scopes use a restrained categorical palette
with translucent fills and matching labels. Color is presentation metadata and
does not enter the topology fingerprint or imply area, latency, or ownership.

The sorter never changes `parentId` to shorten a connection. Queue corridors
and direct links use axis-aligned X/Z segments between exact port anchors. All
leaf buildings are eight world units high and their ports sit on the same
`Y=8` roof plane, so ordinary Queue routes have no raised deck or up/down
segment.

A `SimQueue` remains a topology node with identity, capacity, area, selection,
and runtime state, but it is not drawn as a separate building. Its visual is the
producer-to-consumer transparent glass corridor itself. Direction markers and
fluorescent packets follow that corridor. Preview occupancy may drive bounded
sample packets during M2; M4 replaces it with accepted current-format Queue
events. A Queue with no data has no moving packet.

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
three axes. Rendering subtracts a stable focus origin while positions are still
in chunk/local form, then uploads only nearby relative coordinates to Three.js.
Selecting a distant object changes the render origin without changing the
authoritative world, topology fingerprint, or instance IDs.

## Run boundary

The current run manifest binds simulator revision, workload, configuration,
topology fingerprint, observation capabilities, event window, and truncation
status. A run whose topology fingerprint differs from the open world is stale
and cannot supply current performance results. The active runtime reads gzip
chunks and checkpoints in a Worker and keeps cycle/address/identity values as
lossless decimal strings.

The browser may always inspect a valid topology. The default recorded run comes
from SuperScalarModel revision
`2406db2944317b8d64dc05b621f37fc9a13f8c81` and is labeled with its simulator,
workload, configuration, and topology binding. Synthetic bundles remain test
fixtures. A paired recording keeps the workload and topology fixed while
enabling CellReg arbitration and reducing Cube bank bandwidth, so users can
compare a normal run with a proven bank-conflict run. Static hosting loads
recorded runs; it does not pretend to run a local simulator.

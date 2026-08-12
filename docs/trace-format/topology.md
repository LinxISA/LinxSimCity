# Topology and stable entity IDs

`topology.json` describes hardware identity and hierarchy. It carries placement hints, not WebGL coordinates. The viewer derives 3D geometry from entity kinds, capacities, and district placement.

```json
{
  "schemaVersion": "1.0.0",
  "entities": [
    {
      "id": "pe2.bg.bank5.row23",
      "kind": "cell",
      "parentId": "pe2.bg.bank5",
      "label": "CELL B5[23]",
      "instance": { "index": 23 },
      "attributes": { "bytes": 128 }
    }
  ]
}
```

## Entity fields

| Field        | Required | Meaning                                                        |
| ------------ | -------- | -------------------------------------------------------------- |
| `id`         | Yes      | Unique structural ID; event references use this value          |
| `kind`       | Yes      | Physical rendering/inspection category                         |
| `label`      | Yes      | Human-readable name; never used to derive identity             |
| `instance`   | Yes      | Structural indexes such as PE, bank, row, set, way, or slot    |
| `parentId`   | No       | Existing parent entity                                         |
| `capacity`   | No       | Positive number of indexed child instances                     |
| `ports`      | No       | Unique per-entity port IDs, direction, and optional byte width |
| `placement`  | No       | `district`, `order`, `row`, and `column` hints                 |
| `attributes` | No       | Numeric, string, or boolean hardware metadata                  |

Supported kinds are `module`, `cache-line`, `rob-slot`, `queue-slot`, `register`, `cell`, `xbar-lane`, `cube-mac`, `stgbufb-subspace`, and `pipe`.

## ID grammar

IDs use lowercase structural segments and decimal indexes. Display labels may change without changing IDs.

| Resource         | Example                   |
| ---------------- | ------------------------- |
| Module           | `core.scalar.l1d`         |
| Cache line       | `core.scalar.l1d.line37`  |
| ROB slot         | `core.scalar.rob.slot127` |
| Queue slot       | `core.scalar.iq.slot5`    |
| Register         | `core.scalar.prf.r42`     |
| 128B CELL        | `pe2.bg.bank5.row23`      |
| Crossbar lane    | `pe2.xbar.a3`             |
| CUBE MAC         | `pe2.cube.mac.m12.n3`     |
| StgBufB subspace | `stgbufb.ssb17`           |
| Pipe             | `pipe.b-broadcast`        |

The intended CELL hierarchy is four PE quarters, eight banks per PE, and 256 rows per bank. Each row is one independently highlightable 128-byte CELL. CUBE uses four horizontal PE strips aligned with those quarters. A uses four horizontal 128-byte lanes selected by the 8→4 Crossbar; B broadcasts vertically from `stgbufb` below the matrix.

## Validation

Topology validation reports structured diagnostics for:

- duplicate entity or per-entity port IDs;
- missing parents;
- zero or negative capacity;
- a present `instance.index` that is not a non-negative safe integer;
- an index outside the parent capacity;
- event references to missing entity IDs.

Consumers must not infer topology identity from array order, labels, colors, or scene coordinates.

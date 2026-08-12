# Trace events

Every chunk line contains one event envelope:

```json
{
  "cycle": 120,
  "seq": 2,
  "type": "cell.read",
  "scope": "pe0",
  "entity_id": "pe0.bg.bank2.row23",
  "payload": {
    "request_id": 91,
    "source": "cube",
    "bytes": 128,
    "result": "grant"
  }
}
```

| Field       | Rule                                                            |
| ----------- | --------------------------------------------------------------- |
| `cycle`     | Non-negative safe integer                                       |
| `seq`       | Non-negative safe integer assigned by the writer within a cycle |
| `type`      | One literal from the table below                                |
| `scope`     | Non-empty execution scope, such as `core0` or `pe2`             |
| `entity_id` | Stable ID present in `topology.json`                            |
| `payload`   | Event-specific object; optional future fields are preserved     |

## Event categories

| Category    | Event literals                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instruction | `instruction.fetch`, `instruction.decode`, `instruction.rename`, `instruction.dispatch`, `instruction.issue`, `instruction.complete`, `instruction.retire`, `instruction.squash` |
| Pipeline    | `pipeline.enter`, `pipeline.leave`, `pipeline.stall`                                                                                                                             |
| Queue       | `queue.allocate`, `queue.release`, `queue.occupancy`, `queue.full`                                                                                                               |
| ROB         | `rob.allocate`, `rob.head`, `rob.tail`, `rob.retire`, `rob.flush`                                                                                                                |
| Register    | `register.read`, `register.write`, `register.ready`                                                                                                                              |
| Cache       | `cache.access`, `cache.hit`, `cache.miss`, `cache.fill`, `cache.writeback`                                                                                                       |
| CELL        | `cell.read`, `cell.write`, `cell.grant`, `cell.conflict`                                                                                                                         |
| Crossbar    | `crossbar.request`, `crossbar.grant`                                                                                                                                             |
| CUBE        | `cube.dispatch`, `cube.stage`, `cube.complete`, `cube.writeback`                                                                                                                 |
| Vector      | `vector.dispatch`, `vector.stage`, `vector.complete`, `vector.writeback`                                                                                                         |
| Memory      | `memory.request`, `memory.response`                                                                                                                                              |
| Pipe        | `pipe.transfer`                                                                                                                                                                  |
| Recovery    | `flush.begin`, `flush.end`                                                                                                                                                       |
| Annotation  | `marker.user`                                                                                                                                                                    |

## Recommended payload fields

Payload fields are additive within schema major 1. Producers should include identifiers and resolved physical locations when the model already knows them.

| Events               | Recommended fields                                                  |
| -------------------- | ------------------------------------------------------------------- |
| Instruction/Pipeline | `uid`, `bid`, `rid`, `stage`, `opcode`, `outcome`, `stall_reason`   |
| Queue/ROB            | `slot`, `occupancy`, `capacity`, `head`, `tail`, `wrap`             |
| Cache                | `level`, `operation`, `set`, `way`, `line`, `result`, `bytes`       |
| CELL                 | `request_id`, `source`, `bank`, `row`, `bytes`, `result`            |
| Crossbar/Pipe        | `request_id`, `lane`, `bytes`, `direction`, `source`, `destination` |
| CUBE                 | `uop`, `stage`, `pe`, `m`, `n`, `k`, `ssbid`, `operand`             |
| Vector               | `uop`, `stage`, `slice`, `operation`                                |
| Memory               | `request_id`, `operation`, `bytes`, `level`, `result`               |
| Flush                | `reason`, `from_slot`, `squashed`, `restart_cycle`                  |

`cell.read` standardizes `request_id`, `source`, `bytes`, and `result` (`grant` or `conflict`) while retaining future fields. The synthetic fixture also demonstrates four-bank A grants, a vertical GMMA B broadcast, ROB wraparound, cache hit/miss/fill, CELL conflict, and flush events.

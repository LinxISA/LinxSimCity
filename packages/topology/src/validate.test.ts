import type { EventEnvelope } from "@linxsimcity/trace-schema";
import { describe, expect, test } from "vitest";

import {
  type TopologyDescriptor,
  validateEventReferences,
  validateTopology,
} from "./index.js";

describe("validateTopology", () => {
  test("reports duplicate entity IDs", () => {
    const result = validateTopology({
      schemaVersion: "1.0.0",
      entities: [
        { id: "x", kind: "module", label: "A", instance: {} },
        { id: "x", kind: "module", label: "B", instance: {} },
      ],
    });

    expect(result.errors[0]?.code).toBe("duplicate_entity_id");
    expect(result.errors[0]?.path).toBe("entities[1].id");
  });

  test("reports missing parents, invalid capacities, and out-of-range instances", () => {
    const result = validateTopology({
      schemaVersion: "1.0.0",
      entities: [
        {
          id: "queue",
          kind: "module",
          label: "Queue",
          instance: {},
          capacity: 2,
        },
        {
          id: "queue.slot2",
          kind: "queue-slot",
          parentId: "queue",
          label: "Slot 2",
          instance: { index: 2 },
        },
        {
          id: "orphan",
          kind: "module",
          parentId: "missing",
          label: "Orphan",
          instance: {},
        },
        {
          id: "empty",
          kind: "module",
          label: "Empty",
          instance: {},
          capacity: 0,
        },
        {
          id: "fractional",
          kind: "module",
          label: "Fractional",
          instance: {},
          capacity: 1.5,
        },
      ],
    });

    expect(result.errors.map(({ code }) => code)).toEqual([
      "invalid_capacity",
      "invalid_capacity",
      "instance_out_of_range",
      "missing_parent",
    ]);
  });

  test("requires port IDs to be unique within an entity", () => {
    const result = validateTopology({
      schemaVersion: "1.0.0",
      entities: [
        {
          id: "scalar.fetch",
          kind: "module",
          label: "Fetch",
          instance: {},
          ports: [
            { id: "out", direction: "out" },
            { id: "out", direction: "out", widthBytes: 16 },
          ],
        },
      ],
    });

    expect(result.errors).toMatchObject([
      { code: "duplicate_entity_id", path: "entities[0].ports[1].id" },
    ]);
  });

  test.each(["999", -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects a present non-index instance value: %s",
    (index) => {
      const result = validateTopology({
        schemaVersion: "1.0.0",
        entities: [
          {
            id: "queue.slot",
            kind: "queue-slot",
            label: "Queue slot",
            instance: { index },
          },
        ],
      });

      expect(result.errors).toMatchObject([
        {
          code: "instance_out_of_range",
          path: "entities[0].instance.index",
        },
      ]);
    },
  );

  test("accepts a valid descriptor with placement, ports, and attributes", () => {
    const topology: TopologyDescriptor = {
      schemaVersion: "1.0.0",
      entities: [
        {
          id: "pe0.sperob",
          kind: "module",
          label: "SPEROB",
          instance: { pe: 0 },
          capacity: 128,
          ports: [{ id: "retire", direction: "out", widthBytes: 16 }],
          placement: { district: "scalar", order: 7 },
          attributes: { circular: true },
        },
        {
          id: "pe0.sperob.slot127",
          kind: "rob-slot",
          parentId: "pe0.sperob",
          label: "ROB 127",
          instance: { index: 127 },
        },
      ],
    };

    expect(validateTopology(topology)).toEqual({ errors: [], warnings: [] });
  });
});

describe("validateEventReferences", () => {
  test("reports each event whose entity reference is missing", () => {
    const topology: TopologyDescriptor = {
      schemaVersion: "1.0.0",
      entities: [
        { id: "scalar.fetch", kind: "module", label: "Fetch", instance: {} },
      ],
    };
    const events: EventEnvelope[] = [
      {
        cycle: 1,
        seq: 0,
        type: "pipeline.enter",
        scope: "scalar",
        entity_id: "scalar.fetch",
        payload: {},
      },
      {
        cycle: 1,
        seq: 1,
        type: "pipeline.leave",
        scope: "scalar",
        entity_id: "scalar.decode",
        payload: {},
      },
    ];

    expect(validateEventReferences(topology, events).errors).toEqual([
      {
        severity: "error",
        code: "missing_entity_reference",
        path: "events[1].entity_id",
        message: 'event references missing entity "scalar.decode"',
      },
    ]);
  });
});

import type { EventEnvelope } from "@linxsimcity/trace-schema";
import { describe, expect, test } from "vitest";

import {
  createEventReferenceIndex,
  type TopologyDescriptor,
  validateEventReferences,
  validateTopology,
} from "./index.js";

describe("validateTopology", () => {
  const physicalTopology = (): TopologyDescriptor => ({
    schemaVersion: "1.1.0",
    layout: {
      schema: "linx-city-v1",
      units: "scene-unit",
      upAxis: "y",
      forwardAxis: "-z",
      districts: [
        {
          id: "scalar",
          position: [0, 2, 0],
          size: [20, 4, 12],
        },
      ],
    },
    entities: [
      {
        id: "pe0.issue",
        kind: "module",
        label: "Issue",
        instance: { index: 0 },
        placement: {
          district: "scalar",
          thread: 0,
          position: [-5, 1, 0],
          size: [4, 2, 3],
          rotation: [0, 0, 0],
          lodGroup: "scalar-pipeline",
        },
        ports: [
          {
            id: "pe0.issue.out1",
            direction: "out",
            position: [-3, 1, 0],
          },
        ],
      },
      {
        id: "pe0.int0",
        kind: "module",
        label: "INT0",
        instance: { index: 0 },
        placement: {
          district: "scalar",
          thread: 0,
          position: [5, 1, 0],
          size: [4, 2, 3],
          rotation: [0, 0, 0],
        },
        ports: [
          {
            id: "pe0.int0.in",
            direction: "in",
            position: [3, 1, 0],
          },
        ],
      },
      {
        id: "pipe.scalar.int0",
        kind: "pipe",
        label: "Issue to INT0",
        instance: { index: 0 },
        route: {
          style: "orthogonal",
          fromPortId: "pe0.issue.out1",
          toPortId: "pe0.int0.in",
          points: [
            [-3, 1, 0],
            [0, 1, 0],
            [0, 1, 2],
            [3, 1, 2],
            [3, 1, 0],
          ],
        },
      },
    ],
  });

  test("accepts finite physical placement and an orthogonal route", () => {
    expect(validateTopology(physicalTopology())).toEqual({
      errors: [],
      warnings: [],
    });
  });

  test("rejects invalid district and entity geometry", () => {
    const topology = physicalTopology();
    topology.layout!.districts[0]!.size = [20, 0, 12];
    topology.entities[0]!.placement!.position = [Number.NaN, 1, 0];
    topology.entities[1]!.placement!.size = [4, -2, 3];

    expect(validateTopology(topology).errors).toMatchObject([
      { code: "invalid_layout", path: "layout.districts[0].size[1]" },
      {
        code: "invalid_placement",
        path: "entities[0].placement.position[0]",
      },
      {
        code: "invalid_placement",
        path: "entities[1].placement.size[1]",
      },
    ]);
  });

  test("rejects an entity outside its declared district", () => {
    const topology = physicalTopology();
    topology.entities[1]!.placement!.position = [10, 1, 0];

    expect(validateTopology(topology).errors).toMatchObject([
      {
        code: "placement_out_of_bounds",
        path: "entities[1].placement",
      },
    ]);
  });

  test("requires globally unique port IDs and existing route endpoints", () => {
    const topology = physicalTopology();
    topology.entities[1]!.ports![0]!.id = "pe0.issue.out1";
    topology.entities[2]!.route!.toPortId = "pe0.missing.in";

    expect(validateTopology(topology).errors).toMatchObject([
      {
        code: "duplicate_entity_id",
        path: "entities[1].ports[0].id",
      },
      {
        code: "missing_port_reference",
        path: "entities[2].route.toPortId",
      },
    ]);
  });

  test("rejects an unsupported physical coordinate contract", () => {
    const topology = physicalTopology() as unknown as {
      layout: {
        schema: string;
        units: string;
        upAxis: string;
        forwardAxis: string;
      };
    } & TopologyDescriptor;
    topology.layout.schema = "unknown-city";
    topology.layout.units = "millimeter";
    topology.layout.upAxis = "z";
    topology.layout.forwardAxis = "+z";

    expect(validateTopology(topology).errors).toMatchObject([
      { code: "invalid_layout", path: "layout.schema" },
      { code: "invalid_layout", path: "layout.units" },
      { code: "invalid_layout", path: "layout.upAxis" },
      { code: "invalid_layout", path: "layout.forwardAxis" },
    ]);
  });

  test("requires route endpoints to meet their physical port positions", () => {
    const topology = physicalTopology();
    topology.entities[2]!.route!.points[0] = [-2, 1, 0];
    topology.entities[2]!.route!.points[4] = [3, 1, 1];

    expect(validateTopology(topology).errors).toMatchObject([
      {
        code: "invalid_route",
        path: "entities[2].route.points[0]",
      },
      {
        code: "invalid_route",
        path: "entities[2].route.points[4]",
      },
    ]);
  });

  test("rejects diagonal and zero-length route segments", () => {
    const topology = physicalTopology();
    topology.entities[2]!.route!.points = [
      [-3, 1, 0],
      [0, 1, 2],
      [0, 1, 2],
      [3, 1, 0],
    ];

    expect(validateTopology(topology).errors).toMatchObject([
      {
        code: "invalid_route",
        path: "entities[2].route.points[1]",
      },
      {
        code: "invalid_route",
        path: "entities[2].route.points[2]",
      },
      {
        code: "invalid_route",
        path: "entities[2].route.points[3]",
      },
    ]);
  });

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

  test("reuses a precomputed entity index across streamed event batches", () => {
    const topology: TopologyDescriptor = {
      schemaVersion: "1.0.0",
      entities: [
        { id: "scalar.fetch", kind: "module", label: "Fetch", instance: {} },
      ],
    };
    const index = createEventReferenceIndex(topology);
    const validEvent: EventEnvelope = {
      cycle: 1,
      seq: 0,
      type: "pipeline.enter",
      scope: "scalar",
      entity_id: "scalar.fetch",
      payload: {},
    };
    const invalidEvent = { ...validEvent, seq: 1, entity_id: "scalar.decode" };

    expect(validateEventReferences(index, [validEvent]).errors).toEqual([]);
    expect(validateEventReferences(index, [invalidEvent]).errors).toEqual([
      {
        severity: "error",
        code: "missing_entity_reference",
        path: "events[0].entity_id",
        message: 'event references missing entity "scalar.decode"',
      },
    ]);
  });
});

import { describe, expect, test } from "vitest";

import type {
  TopologyDescriptor,
  TopologyDistrict,
  TopologyEntity,
  TopologyVector3,
} from "./types.js";
import { findLayoutCollisions } from "./layout-collision.js";

function moduleEntity(
  id: string,
  district: string,
  position: TopologyVector3,
  size: TopologyVector3,
  parentId = `${district}.root`,
): TopologyEntity {
  return {
    id,
    kind: "module",
    parentId,
    label: id,
    instance: {},
    placement: { district, position, size },
  };
}

function topology(
  districts: readonly TopologyDistrict[],
  entities: readonly TopologyEntity[] = [],
): TopologyDescriptor {
  return {
    schemaVersion: "1.1.0",
    layout: {
      schema: "linx-city-v1",
      units: "scene-unit",
      upAxis: "y",
      forwardAxis: "-z",
      districts: [...districts],
    },
    entities: [...entities],
  };
}

describe("layout collision validation", () => {
  test("reports positive sibling district overlap but ignores the core container", () => {
    const result = findLayoutCollisions(
      topology([
        { id: "core", position: [0, 0, 0], size: [40, 4, 20] },
        { id: "scalar", position: [-5, 0, 0], size: [12, 2, 10] },
        { id: "vector", position: [4, 0, 0], size: [10, 2, 10] },
      ]),
    );

    expect(result).toEqual([
      expect.objectContaining({
        kind: "district-overlap",
        firstId: "scalar",
        secondId: "vector",
      }),
    ]);
  });

  test("allows district and sibling entity edges to touch", () => {
    const entities = [
      moduleEntity("scalar.a", "scalar", [-3, 1, 0], [4, 2, 4]),
      moduleEntity("scalar.b", "scalar", [1, 1, 0], [4, 2, 4]),
    ];
    expect(
      findLayoutCollisions(
        topology(
          [
            { id: "scalar", position: [-5, 0, 0], size: [10, 2, 10] },
            { id: "vector", position: [5, 0, 0], size: [10, 2, 10] },
          ],
          entities,
        ),
      ),
    ).toEqual([]);
  });

  test("reports overlapping solid sibling modules but allows nested children", () => {
    const entities = [
      moduleEntity("scalar.a", "scalar", [0, 1, 0], [6, 2, 6]),
      moduleEntity("scalar.b", "scalar", [2, 1, 0], [6, 2, 6]),
      moduleEntity(
        "scalar.a.child",
        "scalar",
        [0, 1.2, 0],
        [2, 1, 2],
        "scalar.a",
      ),
    ];
    expect(
      findLayoutCollisions(
        topology(
          [{ id: "scalar", position: [0, 0, 0], size: [20, 4, 20] }],
          entities,
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "entity-overlap",
        firstId: "scalar.a",
        secondId: "scalar.b",
      }),
    ]);
  });

  test("reports a pipe crossing an unrelated building but allows its endpoint building", () => {
    const source = {
      ...moduleEntity("scalar.source", "scalar", [-8, 1, 0], [2, 2, 2]),
      ports: [
        {
          id: "scalar.source.out",
          direction: "out" as const,
          position: [-7, 1, 0] as TopologyVector3,
        },
      ],
    };
    const target = {
      ...moduleEntity("scalar.target", "scalar", [8, 1, 0], [2, 2, 2]),
      ports: [
        {
          id: "scalar.target.in",
          direction: "in" as const,
          position: [7, 1, 0] as TopologyVector3,
        },
      ],
    };
    const obstruction = moduleEntity(
      "scalar.obstruction",
      "scalar",
      [0, 1, 0],
      [3, 2, 3],
    );
    const pipe: TopologyEntity = {
      id: "scalar.pipe.source-target",
      kind: "pipe",
      label: "source to target",
      instance: {},
      route: {
        style: "orthogonal",
        fromPortId: "scalar.source.out",
        toPortId: "scalar.target.in",
        points: [
          [-7, 1, 0],
          [7, 1, 0],
        ],
      },
    };

    expect(
      findLayoutCollisions(
        topology(
          [{ id: "scalar", position: [0, 0, 0], size: [24, 4, 12] }],
          [source, target, obstruction, pipe],
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "pipe-building-crossing",
        firstId: "scalar.pipe.source-target",
        secondId: "scalar.obstruction",
      }),
    ]);
  });
});

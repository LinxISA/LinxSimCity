/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Runtime Node ESM implementation is typed by the adjacent .d.mts contract.

const CORE_DISTRICT = {
  id: "core",
  position: [0, 0, 0],
  size: [240, 10, 128],
};

export const PIPEVIEW_DISTRICTS = Object.freeze({
  scalar: { id: "scalar", position: [-93.5, 0, -12], size: [45, 8, 92] },
  vector: { id: "vector", position: [-50.5, 0, -12], size: [35, 8, 92] },
  cell: { id: "cell", position: [-2.5, 0, -12], size: [55, 8, 92] },
  cube: { id: "cube", position: [72, 0, -12], size: [88, 8, 92] },
  tlsu: { id: "tlsu", position: [-45.5, 0, 49], size: [141, 6, 22] },
  sharedTileRegister: {
    id: "shared_tile_register",
    position: [72, 0, 49],
    size: [88, 6, 22],
  },
});

export const PIPEVIEW_STAGE_DOMAINS = Object.freeze({
  scalar: Object.freeze([
    "F0",
    "F1",
    "F2",
    "F3",
    "F4",
    "F5",
    "D0",
    "D1",
    "D2",
    "D3",
    "S1",
    "IQ",
    "RD",
    "P1",
    "I1",
    "I2",
    "E0",
    "E1",
    "E2",
    "E3",
    "E4",
    "E5",
    "W1",
    "W2",
    "CM",
    "R",
  ]),
  scalarMemory: Object.freeze([
    "LSU-E1",
    "LDQ",
    "LQP",
    "LQI",
    "L1M",
    "L2M",
    "MR",
    "L2R",
    "L1R",
    "LR",
  ]),
  vector: Object.freeze([
    "F",
    "S",
    "P",
    "I",
    "E1",
    "E2",
    "E3",
    "E4",
    "E5",
    "W1",
    "W2",
    "CM",
  ]),
  cube: Object.freeze([
    "Issue",
    "Rename",
    "GenLoad",
    "Wait",
    "SrcAReady",
    "SrcBReady",
    "SrcCReady",
    "RdBuffer",
    "Ctrl",
    "Calc",
    "L0CWr",
    "Commit",
  ]),
  acccvt: Object.freeze([
    "Start",
    "Rename",
    "Issue",
    "Arb",
    "Wait",
    "SrcReady",
    "SrcData",
    "FixPipe",
  ]),
  tlsu: Object.freeze([
    "Start",
    "ToScalper",
    "ToTile",
    "GenPreReq",
    "MemoryReq",
    "PreDataRet",
    "FromScalper",
    "GenLoadReq",
    "TileReadReq",
    "TileDataRet",
    "LoadDataRet",
    "Commit",
  ]),
  tileBridge: Object.freeze([
    "Start",
    "WaitB",
    "GenR",
    "Tag",
    "WaitR",
    "GenW",
    "WaitW",
    "Integ",
    "Ready",
    "TXed",
    "Bus",
    "DBID",
    "Ret",
    "Comp",
  ]),
});

const STAGE_LAYOUTS = Object.freeze({
  scalar: {
    district: "scalar",
    rect: { x: -93.5, z: -25, width: 41, depth: 62 },
    columns: 4,
  },
  vector: {
    district: "vector",
    rect: { x: -50.5, z: -12, width: 31, depth: 88 },
    columns: 3,
  },
  cube: {
    district: "cube",
    rect: { x: 72, z: -22, width: 84, depth: 64 },
    columns: 4,
  },
  acccvt: {
    district: "cube",
    rect: { x: 72, z: 24, width: 84, depth: 16 },
    columns: 8,
  },
  scalarMemory: {
    district: "tlsu",
    rect: { x: -45.5, z: 42, width: 137, depth: 5 },
    columns: 10,
  },
  tlsu: {
    district: "tlsu",
    rect: { x: -45.5, z: 49, width: 137, depth: 5 },
    columns: 12,
  },
  tileBridge: {
    district: "tlsu",
    rect: { x: -45.5, z: 56, width: 137, depth: 5 },
    columns: 14,
  },
});

function stageKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function clone(value) {
  return globalThis.structuredClone(value);
}

function districtBounds(district) {
  return {
    minX: district.position[0] - district.size[0] / 2,
    maxX: district.position[0] + district.size[0] / 2,
    minZ: district.position[2] - district.size[2] / 2,
    maxZ: district.position[2] + district.size[2] / 2,
  };
}

function mapPoint(point, source, target) {
  const x =
    target.position[0] +
    ((point[0] - source.position[0]) / source.size[0]) * target.size[0];
  const z =
    target.position[2] +
    ((point[2] - source.position[2]) / source.size[2]) * target.size[2];
  return [x, point[1], z];
}

function mapSize(size, source, target) {
  return [
    (size[0] / source.size[0]) * target.size[0],
    size[1],
    (size[2] / source.size[2]) * target.size[2],
  ];
}

function containingDistrict(point, districts) {
  return districts
    .filter(({ id }) => id !== "core")
    .filter((district) => {
      const bounds = districtBounds(district);
      return (
        point[0] >= bounds.minX &&
        point[0] <= bounds.maxX &&
        point[2] >= bounds.minZ &&
        point[2] <= bounds.maxZ
      );
    })
    .sort((first, second) => {
      const firstDistance =
        Math.abs(point[0] - first.position[0]) / first.size[0] +
        Math.abs(point[2] - first.position[2]) / first.size[2];
      const secondDistance =
        Math.abs(point[0] - second.position[0]) / second.size[0] +
        Math.abs(point[2] - second.position[2]) / second.size[2];
      return firstDistance - secondDistance;
    })[0];
}

function targetDistrictFor(id) {
  if (id === "stgbufb") return PIPEVIEW_DISTRICTS.sharedTileRegister;
  return PIPEVIEW_DISTRICTS[id];
}

function contentTargetFor(entity, districtId) {
  if (districtId === "scalar") {
    return { id: "scalar", position: [-93.5, 0, 21], size: [43, 8, 24] };
  }
  if (
    districtId === "cube" &&
    (entity.id.includes(".cube") || entity.kind === "cube-mac")
  ) {
    return {
      id: "cube",
      position: [61.375, 0, -0.33333333333333215],
      size: [20.25, 8, 20.666666666666668],
    };
  }
  return targetDistrictFor(districtId);
}

function remapExistingTopology(topology, alreadyEnriched) {
  const sourceDistricts = topology.layout?.districts ?? [];
  const sourceById = new Map(
    sourceDistricts.map((district) => [district.id, district]),
  );
  const entities = topology.entities
    .filter(
      ({ id, attributes }) =>
        id !== "stgbufb" &&
        !id.startsWith("stgbufb.") &&
        id !== "shared_tile_register" &&
        !id.startsWith("shared_tile_register.") &&
        !id.startsWith("pipeview.") &&
        attributes?.visualRole !== "pipeview-stage" &&
        attributes?.visualRole !== "pipeview-pipe" &&
        attributes?.operand !== "A" &&
        attributes?.operand !== "B",
    )
    .map((entity) => {
      const result = clone(entity);
      if (alreadyEnriched) {
        if (result.kind === "cube-mac" && result.placement) {
          if (result.placement.position) result.placement.position[1] = 2.52;
          if (result.placement.size) result.placement.size[1] = 0.34;
        }
        return result;
      }
      const sourceDistrictId = result.placement?.district;
      const sourceDistrict = sourceDistrictId
        ? sourceById.get(sourceDistrictId)
        : undefined;
      const targetDistrict = sourceDistrictId
        ? contentTargetFor(result, sourceDistrictId)
        : undefined;
      if (result.id === "core" && result.placement) {
        result.placement.position = clone(CORE_DISTRICT.position);
        result.placement.size = [240, result.placement.size?.[1] ?? 8, 128];
        result.attributes = {
          ...result.attributes,
          collisionRole: "container",
        };
      } else if (sourceDistrict && targetDistrict && result.placement) {
        result.placement.district = targetDistrict.id;
        if (result.placement.position) {
          result.placement.position = mapPoint(
            result.placement.position,
            sourceDistrict,
            targetDistrict,
          );
        }
        if (result.placement.size) {
          result.placement.size = mapSize(
            result.placement.size,
            sourceDistrict,
            targetDistrict,
          );
        }
      }
      if (result.kind === "cube-mac" && result.placement) {
        if (result.placement.position) result.placement.position[1] = 2.52;
        if (result.placement.size) result.placement.size[1] = 0.34;
      }
      if (result.kind === "module") {
        result.attributes = {
          ...result.attributes,
          collisionRole: "container",
          visualRole: result.id === "core" ? "core-floor" : "legacy-hardware",
        };
      } else if (result.kind === "pipe") {
        result.attributes = {
          ...result.attributes,
          collisionRole: "hidden",
          visualRole: "legacy-pipe",
        };
      }
      if (sourceDistrict && targetDistrict && result.ports) {
        result.ports = result.ports.map((port) => ({
          ...port,
          ...(port.position
            ? {
                position: mapPoint(
                  port.position,
                  sourceDistrict,
                  targetDistrict,
                ),
              }
            : {}),
        }));
      }
      return result;
    });

  const portPosition = new Map();
  for (const entity of entities) {
    for (const port of entity.ports ?? []) {
      if (port.position) portPosition.set(port.id, port.position);
    }
  }
  for (const entity of entities) {
    if (!entity.route) continue;
    const points = entity.route.points.map((point) => {
      const source = containingDistrict(point, sourceDistricts);
      const target = source ? targetDistrictFor(source.id) : undefined;
      return source && target ? mapPoint(point, source, target) : point;
    });
    const first = portPosition.get(entity.route.fromPortId);
    const last = portPosition.get(entity.route.toPortId);
    if (first) points[0] = first;
    if (last) points[points.length - 1] = last;
    entity.route.points = points;
  }
  return entities;
}

export function packStageBuildings({ rect, stages, columns, gap = 1 }) {
  const rows = Math.ceil(stages.length / columns);
  const width = (rect.width - gap * (columns - 1)) / columns;
  const depth = (rect.depth - gap * (rows - 1)) / rows;
  const minX = rect.x - rect.width / 2;
  const minZ = rect.z - rect.depth / 2;
  return stages.map((stage, order) => {
    const row = Math.floor(order / columns);
    const offset = order % columns;
    const column = row % 2 === 0 ? offset : columns - 1 - offset;
    return {
      stage,
      order,
      row,
      column,
      position: [
        minX + column * (width + gap) + width / 2,
        1.15,
        minZ + row * (depth + gap) + depth / 2,
      ],
      size: [width, 2.1, depth],
    };
  });
}

function edgeToward(from, to) {
  const dx = to.position[0] - from.position[0];
  const dz = to.position[2] - from.position[2];
  if (Math.abs(dx) >= Math.abs(dz)) {
    return [
      from.position[0] + (Math.sign(dx || 1) * from.size[0]) / 2,
      1.45,
      from.position[2],
    ];
  }
  return [
    from.position[0],
    1.45,
    from.position[2] + (Math.sign(dz || 1) * from.size[2]) / 2,
  ];
}

function stageDomainEntities(domain, stages, layout) {
  const rootId = `pipeview.${stageKey(domain)}`;
  const district = targetDistrictFor(layout.district);
  const placements = packStageBuildings({
    rect: layout.rect,
    stages,
    columns: layout.columns,
  });
  const modules = placements.map((placement, index) => {
    const previous = placements[index - 1] ?? {
      ...placement,
      position: [
        placement.position[0] - 1,
        placement.position[1],
        placement.position[2],
      ],
    };
    const next = placements[index + 1] ?? {
      ...placement,
      position: [
        placement.position[0] + 1,
        placement.position[1],
        placement.position[2],
      ],
    };
    const id = `${rootId}.stage.${stageKey(placement.stage)}`;
    return {
      id,
      kind: "module",
      parentId: rootId,
      label: placement.stage,
      instance: { index },
      ports: [
        {
          id: `${id}.in`,
          direction: "in",
          position: edgeToward(placement, previous),
        },
        {
          id: `${id}.out`,
          direction: "out",
          position: edgeToward(placement, next),
        },
      ],
      placement: {
        district: layout.district,
        position: placement.position,
        size: placement.size,
        order: index,
        row: placement.row,
        column: placement.column,
        lodGroup: `pipeview-${stageKey(domain)}`,
      },
      attributes: {
        visualRole: "pipeview-stage",
        stageDomain: domain,
        stageId: placement.stage,
        stageOrder: index,
        peBays: 4,
      },
    };
  });
  const pipes = modules.slice(0, -1).map((module, index) => {
    const next = modules[index + 1];
    const from = module.ports[1].position;
    const to = next.ports[0].position;
    return {
      id: `${rootId}.pipe.${stageKey(stages[index])}-${stageKey(stages[index + 1])}`,
      kind: "pipe",
      label: `${stages[index]} -> ${stages[index + 1]}`,
      instance: { index },
      route: {
        style: "orthogonal",
        fromPortId: module.ports[1].id,
        toPortId: next.ports[0].id,
        points: [from, to],
      },
      attributes: {
        visualRole: "pipeview-pipe",
        stageDomain: domain,
        fromStage: stages[index],
        toStage: stages[index + 1],
      },
    };
  });
  const root = {
    id: rootId,
    kind: "module",
    parentId: "core",
    label: `${domain} PipeView`,
    instance: {},
    placement: {
      district: layout.district,
      position: clone(district.position),
      size: clone(district.size),
    },
    attributes: {
      collisionRole: "container",
      visualRole: "pipeview-domain",
      stageDomain: domain,
    },
  };
  return [root, ...modules, ...pipes];
}

function operandEntities() {
  const entities = [];
  const cellRoot = {
    id: "pipeview.cell",
    kind: "module",
    parentId: "core",
    label: "BG / CELL Register Banks",
    instance: {},
    ports: [],
    placement: {
      district: "cell",
      position: clone(PIPEVIEW_DISTRICTS.cell.position),
      size: clone(PIPEVIEW_DISTRICTS.cell.size),
    },
    attributes: { collisionRole: "container", visualRole: "pipeview-domain" },
  };
  const cubeRoot = {
    id: "pipeview.cube-operand",
    kind: "module",
    parentId: "core",
    label: "CUBE Operand Fabric",
    instance: {},
    ports: [],
    placement: {
      district: "cube",
      position: clone(PIPEVIEW_DISTRICTS.cube.position),
      size: clone(PIPEVIEW_DISTRICTS.cube.size),
    },
    attributes: { collisionRole: "container", visualRole: "pipeview-domain" },
  };
  const shared = {
    id: "shared_tile_register",
    kind: "module",
    parentId: "core",
    label: "Shared Tile Register",
    instance: {},
    capacity: 2048,
    ports: [],
    placement: {
      district: "shared_tile_register",
      position: clone(PIPEVIEW_DISTRICTS.sharedTileRegister.position),
      size: [86, 1.4, 20],
      lodGroup: "shared-tile-register-cells",
    },
    attributes: {
      compatibilityAlias: "stgbufb",
      collisionRole: "container",
      cell_bytes: 128,
      total_bytes: 262144,
    },
  };

  const peDepth = PIPEVIEW_DISTRICTS.cell.size[2] / 4;
  for (let pe = 0; pe < 4; pe++) {
    const peZ =
      PIPEVIEW_DISTRICTS.cell.position[2] -
      PIPEVIEW_DISTRICTS.cell.size[2] / 2 +
      (pe + 0.5) * peDepth;
    for (let lane = 0; lane < 4; lane++) {
      const laneOffset = (lane - 1.5) * 0.72;
      const sourcePosition = [25, 1.6, peZ + laneOffset];
      const targetPosition = [28, 1.6, peZ + laneOffset];
      const sourceId = `pipeview.cell.a.pe${pe}.lane${lane}`;
      const targetId = `pipeview.cube.a.pe${pe}.lane${lane}`;
      cellRoot.ports.push({
        id: sourceId,
        direction: "out",
        position: sourcePosition,
      });
      cubeRoot.ports.push({
        id: targetId,
        direction: "in",
        position: targetPosition,
      });
      entities.push({
        id: `core.pipe.a.pe${pe}.lane${lane}`,
        kind: "pipe",
        label: `A PE${pe} lane ${lane}`,
        instance: { pe, lane },
        route: {
          style: "orthogonal",
          fromPortId: sourceId,
          toPortId: targetId,
          points: [sourcePosition, targetPosition],
        },
        attributes: { visualRole: "operand-pipe", operand: "A", pe, lane },
      });
    }
  }

  for (let pe = 0; pe < 4; pe++) {
    const x = 28 + (pe + 0.5) * 22;
    const sourcePosition = [x, 1.6, 38];
    const targetPosition = [x, 1.6, 34];
    const sourceId = `shared_tile_register.b.pe${pe}`;
    const targetId = `pipeview.cube.b.pe${pe}`;
    shared.ports.push({
      id: sourceId,
      direction: "out",
      widthBytes: 128,
      position: sourcePosition,
    });
    cubeRoot.ports.push({
      id: targetId,
      direction: "in",
      widthBytes: 128,
      position: targetPosition,
    });
    entities.push({
      id: `core.pipe.b.pe${pe}`,
      kind: "pipe",
      label: `B broadcast PE${pe}`,
      instance: { pe },
      route: {
        style: "orthogonal",
        fromPortId: sourceId,
        toPortId: targetId,
        points: [sourcePosition, targetPosition],
      },
      attributes: { visualRole: "operand-pipe", operand: "B", pe },
    });
  }

  const cells = [];
  const cellWidth = 86 / 64;
  const cellDepth = 20 / 32;
  const minX = 72 - 43;
  const minZ = 49 - 10;
  for (let ssb = 0; ssb < 64; ssb++) {
    for (let cell = 0; cell < 32; cell++) {
      const index = ssb * 32 + cell;
      cells.push({
        id: `shared_tile_register.ssb${ssb}.cell${cell}`,
        kind: "cell",
        parentId: "shared_tile_register",
        label: `SsbID ${ssb} · cell ${cell}`,
        instance: { index, ssb, cell, bytes: 128 },
        placement: {
          district: "shared_tile_register",
          position: [
            minX + (ssb + 0.5) * cellWidth,
            0.58,
            minZ + (cell + 0.5) * cellDepth,
          ],
          size: [cellWidth * 0.72, 0.62, cellDepth * 0.68],
          row: cell,
          column: ssb,
          lodGroup: "shared-tile-register-cells",
        },
        attributes: { cell_bytes: 128, ssb_id: ssb, byte_offset: cell * 128 },
      });
    }
  }
  return [cellRoot, cubeRoot, shared, ...cells, ...entities];
}

export function enrichPipeviewStageCity(topology) {
  const source = clone(topology);
  const alreadyEnriched = source.entities.some(
    ({ attributes }) => attributes?.visualRole === "pipeview-stage",
  );
  const entities = remapExistingTopology(source, alreadyEnriched);
  for (const [domain, stages] of Object.entries(PIPEVIEW_STAGE_DOMAINS)) {
    entities.push(
      ...stageDomainEntities(domain, stages, STAGE_LAYOUTS[domain]),
    );
  }
  entities.push(...operandEntities());
  return {
    ...source,
    layout: {
      schema: "linx-city-v1",
      units: "scene-unit",
      upAxis: "y",
      forwardAxis: "-z",
      districts: [
        CORE_DISTRICT,
        PIPEVIEW_DISTRICTS.scalar,
        PIPEVIEW_DISTRICTS.vector,
        PIPEVIEW_DISTRICTS.cell,
        PIPEVIEW_DISTRICTS.cube,
        PIPEVIEW_DISTRICTS.tlsu,
        PIPEVIEW_DISTRICTS.sharedTileRegister,
      ].map(clone),
    },
    entities,
  };
}

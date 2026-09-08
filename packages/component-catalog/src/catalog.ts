import type {
  BrickDefinition,
  BrickKind,
  BrickPortDefinition,
  ComponentCatalog,
  PortProtocol,
} from "./types.js";

const port = (
  id: string,
  label: string,
  direction: BrickPortDefinition["direction"],
  protocol: PortProtocol,
  anchor: readonly [number, number, number],
  widthBits = 128,
): BrickPortDefinition => ({
  id,
  label,
  direction,
  protocol,
  widthBits,
  anchor,
});

const definition = (
  id: string,
  label: string,
  kind: BrickKind,
  description: string,
  size: BrickDefinition["size"],
  ports: readonly BrickPortDefinition[],
  parameters: BrickDefinition["parameters"],
): BrickDefinition => ({
  id,
  label,
  kind,
  description,
  size,
  ports,
  parameters,
});

export const CORE_BRICKS: readonly BrickDefinition[] = [
  definition(
    "core.queue",
    "SimQueue",
    "queue",
    "A cycle-visible transport with capacity and backpressure.",
    { x: 5, y: 2.2, z: 2.4 },
    [
      port("in", "Input", "input", "transaction", [-2.5, 0, 0]),
      port("out", "Output", "output", "transaction", [2.5, 0, 0]),
    ],
    {
      capacity: {
        kind: "integer",
        label: "Entries",
        default: 8,
        minimum: 1,
        maximum: 4096,
        step: 1,
      },
      latency: {
        kind: "integer",
        label: "Latency",
        default: 1,
        minimum: 1,
        maximum: 64,
        step: 1,
      },
    },
  ),
  definition(
    "core.table",
    "State Table",
    "table",
    "Indexed resident state with visible rows and allocation status.",
    { x: 4.8, y: 2.6, z: 3.4 },
    [
      port("request", "Request", "input", "metadata", [-2.4, 0, 0]),
      port("result", "Result", "output", "metadata", [2.4, 0, 0]),
    ],
    {
      entries: {
        kind: "integer",
        label: "Rows",
        default: 32,
        minimum: 1,
        maximum: 4096,
        step: 1,
      },
    },
  ),
  definition(
    "core.sram",
    "Tile SRAM",
    "sram",
    "Banked Tile storage whose physical residency can be traced.",
    { x: 5.6, y: 3.2, z: 4.4 },
    [
      port("request", "Memory request", "input", "transaction", [-2.8, 0, 0]),
      port("tile-out", "Tile read", "output", "tile", [2.8, 0, -0.8]),
      port("tile-in", "Tile write", "input", "tile", [2.8, 0, 0.8]),
    ],
    {
      banks: {
        kind: "integer",
        label: "Banks",
        default: 8,
        minimum: 1,
        maximum: 64,
        step: 1,
      },
      rows: {
        kind: "integer",
        label: "Rows per bank",
        default: 256,
        minimum: 1,
        maximum: 65536,
        step: 1,
      },
    },
  ),
  definition(
    "core.register-file",
    "Register File",
    "register-file",
    "Multiported scalar or Tile register storage.",
    { x: 4.6, y: 3, z: 3.2 },
    [
      port("write", "Write", "input", "tile", [-2.3, 0, 0.7]),
      port("read", "Read", "output", "tile", [2.3, 0, -0.7]),
    ],
    {
      entries: {
        kind: "integer",
        label: "Registers",
        default: 64,
        minimum: 1,
        maximum: 4096,
        step: 1,
      },
    },
  ),
  definition(
    "core.alu",
    "Scalar ALU",
    "alu",
    "A latency-parameterized scalar execution pipeline.",
    { x: 4.2, y: 3.8, z: 3.2 },
    [
      port("issue", "Issue", "input", "transaction", [-2.1, 0, 0]),
      port("complete", "Complete", "output", "completion", [2.1, 0, 0]),
    ],
    {
      latency: {
        kind: "integer",
        label: "Latency",
        default: 1,
        minimum: 1,
        maximum: 64,
        step: 1,
      },
    },
  ),
  definition(
    "core.vector",
    "Vector Engine",
    "vector",
    "A lane-parallel vector execution building.",
    { x: 7.2, y: 4.2, z: 4.2 },
    [
      port("issue", "Issue", "input", "transaction", [-3.6, 0, 0]),
      port("tile", "Tile operand", "input", "tile", [0, 0, -2.1]),
      port("result", "Result", "output", "tile", [3.6, 0, 0]),
    ],
    {
      lanes: {
        kind: "integer",
        label: "Lanes",
        default: 8,
        minimum: 1,
        maximum: 128,
        step: 1,
      },
    },
  ),
  definition(
    "core.cube",
    "Cube Array",
    "cube",
    "A matrix engine with a visible MAC array and Tile ports.",
    { x: 7.6, y: 5.2, z: 5.6 },
    [
      port("issue", "Issue", "input", "transaction", [-3.8, 0, 0]),
      port("a", "Tile A", "input", "tile", [0, 0, -2.8]),
      port("b", "Tile B", "input", "tile", [0, 0, 2.8]),
      port("result", "Tile result", "output", "tile", [3.8, 0, 0]),
    ],
    {
      rows: {
        kind: "integer",
        label: "Rows",
        default: 16,
        minimum: 1,
        maximum: 64,
        step: 1,
      },
      columns: {
        kind: "integer",
        label: "Columns",
        default: 16,
        minimum: 1,
        maximum: 64,
        step: 1,
      },
    },
  ),
  definition(
    "core.arbiter",
    "Arbiter",
    "arbiter",
    "A fair request selector with explicit grant output.",
    { x: 3.8, y: 3, z: 3.8 },
    [
      port("requests", "Requests", "input", "control", [-1.9, 0, 0]),
      port("grant", "Grant", "output", "control", [1.9, 0, 0]),
    ],
    {
      inputs: {
        kind: "integer",
        label: "Inputs",
        default: 4,
        minimum: 2,
        maximum: 64,
        step: 1,
      },
    },
  ),
  definition(
    "core.crossbar",
    "Crossbar",
    "crossbar",
    "A typed lane switch between producers and consumers.",
    { x: 6.2, y: 2.2, z: 5.2 },
    [
      port("in", "Inputs", "input", "tile", [-3.1, 0, 0]),
      port("out", "Outputs", "output", "tile", [3.1, 0, 0]),
    ],
    {
      lanes: {
        kind: "integer",
        label: "Lanes",
        default: 4,
        minimum: 1,
        maximum: 64,
        step: 1,
      },
    },
  ),
  definition(
    "core.container",
    "Subsystem",
    "container",
    "A hierarchical district boundary for a reusable assembly.",
    { x: 10, y: 1, z: 8 },
    [
      port("west", "West", "bidirectional", "transaction", [-5, 0, 0]),
      port("east", "East", "bidirectional", "transaction", [5, 0, 0]),
    ],
    {},
  ),
] as const;

export const CORE_CATALOG: ComponentCatalog = {
  schema: "linxsimcity.component-catalog",
  schemaVersion: "1",
  definitions: CORE_BRICKS,
};

export const CORE_BRICK_BY_ID = new Map(
  CORE_BRICKS.map((item) => [item.id, item] as const),
);

import type {
  BrickDefinition,
  BrickKind,
  BrickPortDefinition,
  ComponentCatalog,
  PortProtocol,
  BrickVisualDefinition,
} from "./types.js";

const port = (
  id: string,
  label: string,
  direction: BrickPortDefinition["direction"],
  protocol: PortProtocol,
  anchor: readonly [number, number, number],
  widthBits: number | null = 128,
  cardinality: BrickPortDefinition["cardinality"] = "one",
): BrickPortDefinition => ({
  id,
  label,
  direction,
  protocol,
  widthBits,
  anchor,
  cardinality,
});

const definition = (
  id: string,
  label: string,
  kind: BrickKind,
  description: string,
  size: BrickDefinition["size"],
  ports: readonly BrickPortDefinition[],
  parameters: BrickDefinition["parameters"],
  visual?: BrickVisualDefinition,
): BrickDefinition => {
  const scaleXZ = kind === "queue" || kind === "container" ? 1 : 1.28;
  const scaleY = kind === "queue" || kind === "container" ? 1 : 1.58;
  return {
    id,
    label,
    kind,
    description,
    size: {
      x: size.x * scaleXZ,
      y: size.y * scaleY,
      z: size.z * scaleXZ,
    },
    ports: ports.map((item) => ({
      ...item,
      anchor: [
        item.anchor[0] * scaleXZ,
        item.anchor[1] * scaleY,
        item.anchor[2] * scaleXZ,
      ],
    })),
    parameters,
    visual: visual ?? {
      profile:
        kind === "container"
          ? "district"
          : kind === "io"
            ? "interface"
            : kind === "crossbar" || kind === "arbiter"
              ? "switch"
              : "compute",
    },
  };
};

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
    {
      profile: "queue-pipe",
      dimensionParameters: ["capacity"],
      maxVisibleEntries: 12,
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
    {
      profile: "table-linear",
      dimensionParameters: ["entries"],
      maxVisibleEntries: 16,
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
    {
      profile: "memory-banks",
      dimensionParameters: ["banks", "rows"],
      maxVisibleEntries: 32,
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
    {
      profile: "table-linear",
      dimensionParameters: ["entries"],
      maxVisibleEntries: 16,
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
  definition(
    "ac.source",
    "Traffic Source",
    "io",
    "Agentic Circuit source boundary inferred from serial Python.",
    { x: 4.2, y: 2.4, z: 3.2 },
    [
      port(
        "out",
        "Produced queues",
        "output",
        "transaction",
        [2.1, 0, 0],
        null,
        "many",
      ),
    ],
    {},
  ),
  definition(
    "ac.transform",
    "Transform",
    "alu",
    "A QueueGraph transform block with compiler-owned handshake behavior.",
    { x: 4.4, y: 3.2, z: 3.2 },
    [
      port(
        "in",
        "Input queues",
        "input",
        "transaction",
        [-2.2, 0, 0],
        null,
        "many",
      ),
      port(
        "out",
        "Output queues",
        "output",
        "transaction",
        [2.2, 0, 0],
        null,
        "many",
      ),
    ],
    {
      latency: {
        kind: "integer",
        label: "Latency",
        default: 1,
        minimum: 1,
        maximum: 4096,
        step: 1,
      },
    },
  ),
  definition(
    "ac.dependency",
    "Dependency Window",
    "table",
    "A bounded dependency and execution-resource scheduler.",
    { x: 6.4, y: 3.6, z: 4.8 },
    [
      port(
        "in",
        "Input queues",
        "input",
        "transaction",
        [-3.2, 0, 0],
        null,
        "many",
      ),
      port(
        "out",
        "Ready queues",
        "output",
        "transaction",
        [3.2, 0, 0],
        null,
        "many",
      ),
    ],
    {
      capacity: {
        kind: "integer",
        label: "Window entries",
        default: 8,
        minimum: 1,
        maximum: 4096,
        step: 1,
      },
      resources: {
        kind: "integer",
        label: "Resources",
        default: 1,
        minimum: 1,
        maximum: 4096,
        step: 1,
      },
    },
    {
      profile: "table-matrix",
      dimensionParameters: ["capacity", "resources"],
      maxVisibleEntries: 32,
    },
  ),
  definition(
    "ac.route",
    "Route",
    "crossbar",
    "A typed selector that routes each transaction to one output queue.",
    { x: 6.2, y: 2.6, z: 5.2 },
    [
      port(
        "in",
        "Input queues",
        "input",
        "transaction",
        [-3.1, 0, 0],
        null,
        "many",
      ),
      port(
        "out",
        "Output queues",
        "output",
        "transaction",
        [3.1, 0, 0],
        null,
        "many",
      ),
    ],
    {
      outputs: {
        kind: "integer",
        label: "Outputs",
        default: 2,
        minimum: 1,
        maximum: 4096,
        step: 1,
      },
    },
  ),
  definition(
    "ac.merge",
    "Merge",
    "arbiter",
    "A policy-controlled merge of several transaction queues.",
    { x: 4.8, y: 3.2, z: 4.8 },
    [
      port(
        "in",
        "Input queues",
        "input",
        "transaction",
        [-2.4, 0, 0],
        null,
        "many",
      ),
      port(
        "out",
        "Output queues",
        "output",
        "transaction",
        [2.4, 0, 0],
        null,
        "many",
      ),
    ],
    {
      inputs: {
        kind: "integer",
        label: "Inputs",
        default: 2,
        minimum: 1,
        maximum: 4096,
        step: 1,
      },
    },
  ),
  definition(
    "ac.reorder",
    "Reorder Window",
    "table",
    "A key-ordered retirement window backed by QueueGraph state.",
    { x: 6.2, y: 3.6, z: 4.4 },
    [
      port(
        "in",
        "Completion queues",
        "input",
        "transaction",
        [-3.1, 0, 0],
        null,
        "many",
      ),
      port(
        "out",
        "Ordered queues",
        "output",
        "transaction",
        [3.1, 0, 0],
        null,
        "many",
      ),
    ],
    {
      capacity: {
        kind: "integer",
        label: "Window entries",
        default: 8,
        minimum: 1,
        maximum: 65536,
        step: 1,
      },
    },
    {
      profile: "rob-circular",
      dimensionParameters: ["capacity"],
      maxVisibleEntries: 32,
    },
  ),
  definition(
    "ac.observe",
    "Observer",
    "table",
    "A committed observation tap that does not own the observed queue.",
    { x: 3.4, y: 2.2, z: 2.8 },
    [
      port(
        "in",
        "Observed queues",
        "input",
        "transaction",
        [-1.7, 0, 0],
        null,
        "many",
      ),
    ],
    {},
    {
      profile: "table-linear",
      maxVisibleEntries: 8,
    },
  ),
  definition(
    "ac.sink",
    "Traffic Sink",
    "io",
    "Agentic Circuit sink boundary inferred from serial Python.",
    { x: 4.2, y: 2.4, z: 3.2 },
    [
      port(
        "in",
        "Consumed queues",
        "input",
        "transaction",
        [-2.1, 0, 0],
        null,
        "many",
      ),
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

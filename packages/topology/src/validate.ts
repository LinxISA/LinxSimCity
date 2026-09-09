import type {
  BrickDefinition,
  ComponentCatalog,
} from "@linxsimcity/component-catalog";

import type {
  ArchitectureTopology,
  TopologyDiagnostic,
  TopologyEndpoint,
  TopologyNode,
} from "./types.js";

const STABLE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

function findEndpoint(
  endpoint: TopologyEndpoint,
  nodeById: ReadonlyMap<string, TopologyNode>,
  definitionById: ReadonlyMap<string, BrickDefinition>,
):
  | { node: TopologyNode; definition: BrickDefinition; portIndex: number }
  | undefined {
  const node = nodeById.get(endpoint.nodeId);
  if (!node) return undefined;
  const definition = definitionById.get(node.definitionId);
  if (!definition) return undefined;
  const portIndex = definition.ports.findIndex(
    (port) => port.id === endpoint.portId,
  );
  return portIndex < 0 ? undefined : { node, definition, portIndex };
}

export function validateArchitectureTopology(
  topology: ArchitectureTopology,
  catalog: ComponentCatalog,
): readonly TopologyDiagnostic[] {
  const diagnostics: TopologyDiagnostic[] = [];
  if (
    topology.source &&
    (!topology.source.repository ||
      !topology.source.revision ||
      !/^[a-f0-9]{64}$/.test(topology.source.planSha256) ||
      !/^[a-f0-9]{64}$/.test(topology.source.modelSha256))
  ) {
    diagnostics.push({
      path: "source",
      code: "invalid_source",
      message: "provenance source, revision, and SHA-256 values are required",
    });
  }
  const definitionById = new Map(
    catalog.definitions.map((item) => [item.id, item]),
  );
  const nodeById = new Map<string, TopologyNode>();

  topology.nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;
    if (!STABLE_ID.test(node.id) || nodeById.has(node.id)) {
      diagnostics.push({
        path: `${path}.id`,
        code: "duplicate_id",
        message: "node ID is invalid or duplicated",
      });
    }
    nodeById.set(node.id, node);
    const definition = definitionById.get(node.definitionId);
    if (!definition) {
      diagnostics.push({
        path: `${path}.definitionId`,
        code: "missing_definition",
        message: `definition ${node.definitionId} does not exist`,
      });
      return;
    }
    const area = node.area;
    const validAreaValue =
      area &&
      (area.value === null || (Number.isFinite(area.value) && area.value > 0));
    const valueRequired =
      area && ["measured", "estimated"].includes(area.status);
    if (
      !area ||
      !["measured", "estimated", "aggregate", "unknown"].includes(
        area.status,
      ) ||
      area.unit !== "um2" ||
      !area.source ||
      !validAreaValue ||
      (valueRequired && area.value === null) ||
      (area.status === "unknown" && area.value !== null)
    ) {
      diagnostics.push({
        path: `${path}.area`,
        code: "invalid_area",
        message:
          "area must use um2, carry a source, and match its evidence status",
      });
    }
    for (const [parameterId, value] of Object.entries(node.parameters)) {
      const parameter = definition.parameters[parameterId];
      if (
        !parameter ||
        !Number.isSafeInteger(value) ||
        value < parameter.minimum ||
        value > parameter.maximum ||
        (value - parameter.minimum) % parameter.step !== 0
      ) {
        diagnostics.push({
          path: `${path}.parameters.${parameterId}`,
          code: "invalid_parameter",
          message:
            "parameter is missing from the definition or outside its integer range",
        });
      }
    }
  });

  topology.nodes.forEach((node, index) => {
    if (node.parentId && !nodeById.has(node.parentId)) {
      diagnostics.push({
        path: `nodes[${index}].parentId`,
        code: "invalid_parent",
        message: `parent ${node.parentId} does not exist`,
      });
    } else if (node.parentId) {
      const parent = nodeById.get(node.parentId)!;
      if (definitionById.get(parent.definitionId)?.kind !== "container") {
        diagnostics.push({
          path: `nodes[${index}].parentId`,
          code: "invalid_parent",
          message: `parent ${node.parentId} is not a hierarchy container`,
        });
      }
      const visited = new Set([node.id]);
      let ancestor: TopologyNode | undefined = parent;
      while (ancestor) {
        if (visited.has(ancestor.id)) {
          diagnostics.push({
            path: `nodes[${index}].parentId`,
            code: "invalid_parent",
            message: "hierarchy contains a parent cycle",
          });
          break;
        }
        visited.add(ancestor.id);
        ancestor = ancestor.parentId
          ? nodeById.get(ancestor.parentId)
          : undefined;
      }
    }
  });

  const edgeIds = new Set<string>();
  const occupiedInputs = new Set<string>();
  topology.edges.forEach((edge, index) => {
    const path = `edges[${index}]`;
    if (!STABLE_ID.test(edge.id) || edgeIds.has(edge.id)) {
      diagnostics.push({
        path: `${path}.id`,
        code: "duplicate_id",
        message: "edge ID is invalid or duplicated",
      });
    }
    edgeIds.add(edge.id);
    const from = findEndpoint(edge.from, nodeById, definitionById);
    const to = findEndpoint(edge.to, nodeById, definitionById);
    if (!from || !to) {
      const missingNode =
        !nodeById.has(edge.from.nodeId) || !nodeById.has(edge.to.nodeId);
      diagnostics.push({
        path,
        code: missingNode ? "missing_endpoint" : "missing_port",
        message: "edge endpoint or port does not exist",
      });
      return;
    }
    const fromPort = from.definition.ports[from.portIndex]!;
    const toPort = to.definition.ports[to.portIndex]!;
    if (
      !["output", "bidirectional"].includes(fromPort.direction) ||
      !["input", "bidirectional"].includes(toPort.direction)
    ) {
      diagnostics.push({
        path,
        code: "invalid_direction",
        message: "edges must run from an output to an input",
      });
    }
    if (fromPort.protocol !== toPort.protocol) {
      diagnostics.push({
        path,
        code: "protocol_mismatch",
        message: `${fromPort.protocol} cannot connect to ${toPort.protocol}`,
      });
    }
    if (
      fromPort.widthBits !== null &&
      toPort.widthBits !== null &&
      fromPort.widthBits !== toPort.widthBits
    ) {
      diagnostics.push({
        path,
        code: "width_mismatch",
        message: `${fromPort.widthBits}-bit output cannot connect to ${toPort.widthBits}-bit input`,
      });
    }
    const inputKey = `${edge.to.nodeId}.${edge.to.portId}`;
    if (occupiedInputs.has(inputKey) && toPort.cardinality === "one") {
      diagnostics.push({
        path,
        code: "input_already_connected",
        message: "input already has a producer",
      });
    }
    occupiedInputs.add(inputKey);
  });
  return diagnostics;
}

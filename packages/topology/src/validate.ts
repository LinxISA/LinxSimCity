import type { EventEnvelope } from "@linxsimcity/trace-schema";

import type {
  Diagnostic,
  TopologyDescriptor,
  TopologyDistrict,
  TopologyPlacement,
  TopologyPort,
  TopologyVector3,
  ValidationResult,
} from "./types.js";

function error(
  code: Diagnostic["code"],
  path: string,
  message: string,
): Diagnostic {
  return { severity: "error", code, path, message };
}

function validateVector(
  value: TopologyVector3,
  path: string,
  code: "invalid_layout" | "invalid_placement" | "invalid_route",
  errors: Diagnostic[],
  requirePositive = false,
): boolean {
  let valid = true;
  value.forEach((coordinate, index) => {
    if (!Number.isFinite(coordinate) || (requirePositive && coordinate <= 0)) {
      errors.push(
        error(
          code,
          `${path}[${index}]`,
          requirePositive
            ? "coordinate must be finite and positive"
            : "coordinate must be finite",
        ),
      );
      valid = false;
    }
  });
  return valid;
}

function isPlacementInsideDistrict(
  placement: TopologyPlacement,
  district: TopologyDistrict,
): boolean {
  if (placement.position === undefined || placement.size === undefined) {
    return true;
  }
  return placement.position.every(
    (coordinate, axis) =>
      Math.abs(coordinate - district.position[axis]!) +
        placement.size![axis]! / 2 <=
      district.size[axis]! / 2 + Number.EPSILON,
  );
}

export function validateTopology(
  topology: TopologyDescriptor,
): ValidationResult {
  const errors: Diagnostic[] = [];
  const districtById = new Map<string, TopologyDistrict>();
  if (topology.layout !== undefined) {
    const layoutFields = [
      ["schema", topology.layout.schema, "linx-city-v1"],
      ["units", topology.layout.units, "scene-unit"],
      ["upAxis", topology.layout.upAxis, "y"],
      ["forwardAxis", topology.layout.forwardAxis, "-z"],
    ] as const;
    layoutFields.forEach(([field, actual, expected]) => {
      if (actual !== expected) {
        errors.push(
          error(
            "invalid_layout",
            `layout.${field}`,
            `layout ${field} must be "${expected}"`,
          ),
        );
      }
    });
  }
  topology.layout?.districts.forEach((district, districtIndex) => {
    const districtPath = `layout.districts[${districtIndex}]`;
    if (districtById.has(district.id)) {
      errors.push(
        error(
          "duplicate_entity_id",
          `${districtPath}.id`,
          `duplicate district ID "${district.id}"`,
        ),
      );
    } else {
      districtById.set(district.id, district);
    }
    validateVector(
      district.position,
      `${districtPath}.position`,
      "invalid_layout",
      errors,
    );
    validateVector(
      district.size,
      `${districtPath}.size`,
      "invalid_layout",
      errors,
      true,
    );
  });
  const entityById = new Map(
    topology.entities.map((entity) => [entity.id, entity] as const),
  );
  const seenEntityIds = new Set<string>();
  const portById = new Map<string, TopologyPort>();

  topology.entities.forEach((entity, entityIndex) => {
    const entityPath = `entities[${entityIndex}]`;

    if (seenEntityIds.has(entity.id)) {
      errors.push(
        error(
          "duplicate_entity_id",
          `${entityPath}.id`,
          `duplicate entity ID "${entity.id}"`,
        ),
      );
    } else {
      seenEntityIds.add(entity.id);
    }

    if (
      entity.capacity !== undefined &&
      (!Number.isSafeInteger(entity.capacity) || entity.capacity <= 0)
    ) {
      errors.push(
        error(
          "invalid_capacity",
          `${entityPath}.capacity`,
          "capacity must be a positive safe integer",
        ),
      );
    }

    entity.ports?.forEach((port, portIndex) => {
      if (portById.has(port.id)) {
        errors.push(
          error(
            "duplicate_entity_id",
            `${entityPath}.ports[${portIndex}].id`,
            `duplicate port ID "${port.id}"`,
          ),
        );
      } else {
        portById.set(port.id, port);
      }
      if (port.position !== undefined) {
        validateVector(
          port.position,
          `${entityPath}.ports[${portIndex}].position`,
          "invalid_placement",
          errors,
        );
      }
    });

    if (entity.placement !== undefined) {
      const placement = entity.placement;
      const placementPath = `${entityPath}.placement`;
      if (placement.position !== undefined) {
        validateVector(
          placement.position,
          `${placementPath}.position`,
          "invalid_placement",
          errors,
        );
      }
      if (placement.size !== undefined) {
        validateVector(
          placement.size,
          `${placementPath}.size`,
          "invalid_placement",
          errors,
          true,
        );
      }
      if (placement.rotation !== undefined) {
        validateVector(
          placement.rotation,
          `${placementPath}.rotation`,
          "invalid_placement",
          errors,
        );
      }
      if (
        placement.thread !== undefined &&
        (!Number.isSafeInteger(placement.thread) ||
          placement.thread < 0 ||
          placement.thread > 3)
      ) {
        errors.push(
          error(
            "invalid_placement",
            `${placementPath}.thread`,
            "thread must be a safe integer from 0 through 3",
          ),
        );
      }
    }
  });

  topology.entities.forEach((entity, entityIndex) => {
    const entityPath = `entities[${entityIndex}]`;
    const instanceIndex = entity.instance.index;
    const validInstanceIndex =
      typeof instanceIndex === "number" &&
      Number.isSafeInteger(instanceIndex) &&
      instanceIndex >= 0;

    if (instanceIndex !== undefined && !validInstanceIndex) {
      errors.push(
        error(
          "instance_out_of_range",
          `${entityPath}.instance.index`,
          `instance index ${instanceIndex} must be a non-negative safe integer`,
        ),
      );
    }

    if (entity.parentId !== undefined && !entityById.has(entity.parentId)) {
      errors.push(
        error(
          "missing_parent",
          `${entityPath}.parentId`,
          `parent entity "${entity.parentId}" does not exist`,
        ),
      );
    }

    if (entity.parentId === undefined) {
      // Parentless entities still participate in placement and route checks.
    } else {
      const parent = entityById.get(entity.parentId);
      if (
        validInstanceIndex &&
        parent?.capacity !== undefined &&
        instanceIndex >= parent.capacity
      ) {
        errors.push(
          error(
            "instance_out_of_range",
            `${entityPath}.instance.index`,
            `instance index ${instanceIndex} is outside parent capacity ${parent.capacity}`,
          ),
        );
      }
    }

    const placement = entity.placement;
    if (placement !== undefined && topology.layout !== undefined) {
      const district = districtById.get(placement.district);
      if (district === undefined) {
        errors.push(
          error(
            "invalid_placement",
            `${entityPath}.placement.district`,
            `placement district "${placement.district}" does not exist`,
          ),
        );
      } else if (
        placement.position !== undefined &&
        placement.size !== undefined &&
        placement.position.every(Number.isFinite) &&
        placement.size.every(
          (coordinate) => Number.isFinite(coordinate) && coordinate > 0,
        ) &&
        district.position.every(Number.isFinite) &&
        district.size.every(
          (coordinate) => Number.isFinite(coordinate) && coordinate > 0,
        ) &&
        !isPlacementInsideDistrict(placement, district)
      ) {
        errors.push(
          error(
            "placement_out_of_bounds",
            `${entityPath}.placement`,
            `entity bounds exceed district "${placement.district}"`,
          ),
        );
      }
    }

    const route = entity.route;
    if (route !== undefined) {
      const sourcePort = portById.get(route.fromPortId);
      const destinationPort = portById.get(route.toPortId);
      if (sourcePort === undefined) {
        errors.push(
          error(
            "missing_port_reference",
            `${entityPath}.route.fromPortId`,
            `route source port "${route.fromPortId}" does not exist`,
          ),
        );
      }
      if (destinationPort === undefined) {
        errors.push(
          error(
            "missing_port_reference",
            `${entityPath}.route.toPortId`,
            `route destination port "${route.toPortId}" does not exist`,
          ),
        );
      }
      if (route.points.length < 2) {
        errors.push(
          error(
            "invalid_route",
            `${entityPath}.route.points`,
            "route must contain at least two points",
          ),
        );
      }
      const firstPoint = route.points[0];
      const lastPoint = route.points.at(-1);
      if (
        sourcePort?.position !== undefined &&
        firstPoint !== undefined &&
        !firstPoint.every(
          (coordinate, axis) => coordinate === sourcePort.position![axis],
        )
      ) {
        errors.push(
          error(
            "invalid_route",
            `${entityPath}.route.points[0]`,
            "route must start at its source port position",
          ),
        );
      }
      if (
        destinationPort?.position !== undefined &&
        lastPoint !== undefined &&
        !lastPoint.every(
          (coordinate, axis) => coordinate === destinationPort.position![axis],
        )
      ) {
        errors.push(
          error(
            "invalid_route",
            `${entityPath}.route.points[${route.points.length - 1}]`,
            "route must end at its destination port position",
          ),
        );
      }
      route.points.forEach((point, pointIndex) => {
        const pointPath = `${entityPath}.route.points[${pointIndex}]`;
        const pointValid = validateVector(
          point,
          pointPath,
          "invalid_route",
          errors,
        );
        const previous = route.points[pointIndex - 1];
        if (pointIndex === 0 || previous === undefined || !pointValid) {
          return;
        }
        const changedAxes = point.reduce(
          (count, coordinate, axis) =>
            count + Number(coordinate !== previous[axis]),
          0,
        );
        if (changedAxes !== 1) {
          errors.push(
            error(
              "invalid_route",
              pointPath,
              "each route segment must change exactly one coordinate",
            ),
          );
        }
      });
    }
  });

  return { errors, warnings: [] };
}

export interface EventReferenceIndex {
  readonly entityIds: ReadonlySet<string>;
}

export function createEventReferenceIndex(
  topology: TopologyDescriptor,
): EventReferenceIndex {
  return {
    entityIds: new Set(topology.entities.map(({ id }) => id)),
  };
}

export function validateEventReferences(
  topologyOrIndex: TopologyDescriptor | EventReferenceIndex,
  events: readonly EventEnvelope[],
): ValidationResult {
  const entityIds =
    "entityIds" in topologyOrIndex
      ? topologyOrIndex.entityIds
      : createEventReferenceIndex(topologyOrIndex).entityIds;
  const errors = events.flatMap((event, eventIndex) =>
    entityIds.has(event.entity_id)
      ? []
      : [
          error(
            "missing_entity_reference",
            `events[${eventIndex}].entity_id`,
            `event references missing entity "${event.entity_id}"`,
          ),
        ],
  );

  return { errors, warnings: [] };
}

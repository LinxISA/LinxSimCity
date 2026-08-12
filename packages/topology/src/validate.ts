import type { EventEnvelope } from "@linxsimcity/trace-schema";

import type {
  Diagnostic,
  TopologyDescriptor,
  ValidationResult,
} from "./types.js";

function error(
  code: Diagnostic["code"],
  path: string,
  message: string,
): Diagnostic {
  return { severity: "error", code, path, message };
}

export function validateTopology(
  topology: TopologyDescriptor,
): ValidationResult {
  const errors: Diagnostic[] = [];
  const entityById = new Map(
    topology.entities.map((entity) => [entity.id, entity] as const),
  );
  const seenEntityIds = new Set<string>();

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

    const portIds = new Set<string>();
    entity.ports?.forEach((port, portIndex) => {
      if (portIds.has(port.id)) {
        errors.push(
          error(
            "duplicate_entity_id",
            `${entityPath}.ports[${portIndex}].id`,
            `duplicate port ID "${port.id}" within entity "${entity.id}"`,
          ),
        );
      } else {
        portIds.add(port.id);
      }
    });
  });

  topology.entities.forEach((entity, entityIndex) => {
    const entityPath = `entities[${entityIndex}]`;

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
      return;
    }

    const parent = entityById.get(entity.parentId);
    const instanceIndex = entity.instance.index;
    if (
      instanceIndex !== undefined &&
      (typeof instanceIndex !== "number" ||
        !Number.isSafeInteger(instanceIndex) ||
        instanceIndex < 0)
    ) {
      errors.push(
        error(
          "instance_out_of_range",
          `${entityPath}.instance.index`,
          `instance index ${instanceIndex} must be a non-negative safe integer`,
        ),
      );
    } else if (
      typeof instanceIndex === "number" &&
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
  });

  return { errors, warnings: [] };
}

export function validateEventReferences(
  topology: TopologyDescriptor,
  events: readonly EventEnvelope[],
): ValidationResult {
  const entityIds = new Set(topology.entities.map(({ id }) => id));
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

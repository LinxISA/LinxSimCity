interface PickObject {
  readonly userData: {
    readonly entityId?: string;
    readonly instanceEntityIds?: readonly string[];
  };
}

export interface PickIntersection {
  readonly instanceId?: number;
  readonly object: PickObject;
}

export function pickEntity(
  intersection: PickIntersection | undefined,
): string | undefined {
  if (!intersection) return undefined;
  if (intersection.instanceId !== undefined) {
    return intersection.object.userData.instanceEntityIds?.[
      intersection.instanceId
    ];
  }
  return intersection.object.userData.entityId;
}

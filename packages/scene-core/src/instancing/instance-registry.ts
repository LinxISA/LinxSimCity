export interface InstanceAddress {
  readonly meshKey: string;
  readonly instanceId: number;
}

export class InstanceRegistry {
  private readonly addresses = new Map<string, InstanceAddress>();

  register(entityId: string, meshKey: string, instanceId: number): void {
    if (this.addresses.has(entityId)) {
      throw new Error(
        `entity already has an instance registration: ${entityId}`,
      );
    }
    this.addresses.set(entityId, { meshKey, instanceId });
  }

  get(entityId: string): InstanceAddress | undefined {
    return this.addresses.get(entityId);
  }

  clearMesh(meshKey: string): void {
    for (const [entityId, address] of this.addresses) {
      if (address.meshKey === meshKey) this.addresses.delete(entityId);
    }
  }

  get size(): number {
    return this.addresses.size;
  }
}

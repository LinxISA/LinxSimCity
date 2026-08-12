type HoverListener = (entityId: string | undefined) => void;

export class HoverStore {
  private entityId: string | undefined;
  private readonly listeners = new Set<HoverListener>();

  get(): string | undefined {
    return this.entityId;
  }

  set(entityId: string | undefined): void {
    if (entityId === this.entityId) return;
    this.entityId = entityId;
    for (const listener of this.listeners) listener(entityId);
  }

  subscribe(listener: HoverListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

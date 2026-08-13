const MAX_SHADOWED_INSTANCES = 4_096;

export function shadowsForInstances(instanceCount: number): boolean {
  return instanceCount <= MAX_SHADOWED_INSTANCES;
}

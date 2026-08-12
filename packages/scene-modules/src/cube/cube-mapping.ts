const PE_COUNT = 4;
const M_COUNT = 16;
const N_COUNT = 4;

function bounded(name: string, value: number, limit: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= limit) {
    throw new RangeError(`${name} must be in 0..${limit - 1}`);
  }
  return value;
}

export function cubeInstanceId(pe: number, m: number, n: number): number {
  return (
    bounded("pe", pe, PE_COUNT) * M_COUNT * N_COUNT +
    bounded("m", m, M_COUNT) * N_COUNT +
    bounded("n", n, N_COUNT)
  );
}

export function cubeEntityId(pe: number, m: number, n: number): string {
  cubeInstanceId(pe, m, n);
  return `pe${pe}.cube.mac.m${m}.n${n}`;
}

export function cubeMapping(pe: number, m: number, n: number) {
  return {
    pe,
    m,
    n,
    kDepth: 16,
    instanceId: cubeInstanceId(pe, m, n),
    entityId: cubeEntityId(pe, m, n),
  } as const;
}

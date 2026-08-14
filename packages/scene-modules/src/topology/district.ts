import type {
  TopologyDescriptor,
  TopologyVector3,
} from "@linxsimcity/topology";

export interface DistrictRect {
  readonly center: TopologyVector3;
  readonly size: TopologyVector3;
}

export function districtRect(
  topology: TopologyDescriptor,
  id: string,
): DistrictRect | undefined {
  const district = topology.layout?.districts.find((entry) => entry.id === id);
  return district
    ? { center: district.position, size: district.size }
    : undefined;
}

export function hasPipeviewStageCity(topology: TopologyDescriptor): boolean {
  return topology.entities.some(
    ({ attributes }) => attributes?.visualRole === "pipeview-stage",
  );
}

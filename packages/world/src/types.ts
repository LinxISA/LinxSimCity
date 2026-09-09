import type { BrickSize } from "@linxsimcity/component-catalog";

export const WORLD_CHUNK_SIZE = 64;

export interface AxisPosition {
  readonly chunk: number;
  readonly local: number;
}

export interface WorldPosition {
  readonly x: AxisPosition;
  readonly y: AxisPosition;
  readonly z: AxisPosition;
}

export type LocalPosition = readonly [number, number, number];

export interface BrickTransform {
  readonly position: WorldPosition;
  readonly yawRadians: number;
}

export interface BrickInstance {
  readonly id: string;
  readonly definitionId: string;
  readonly label?: string;
  readonly transform: BrickTransform;
  readonly parameters: Readonly<Record<string, number>>;
  readonly visualSize?: BrickSize;
  readonly hierarchyDepth: number;
  readonly topologyRank: number;
  readonly topologyOrder: number;
  readonly laneId: string;
}

export interface WorldLinkEndpoint {
  readonly instanceId: string;
  readonly portId: string;
}

export interface WorldLink {
  readonly id: string;
  readonly from: WorldLinkEndpoint;
  readonly to: WorldLinkEndpoint;
}

export interface WorldQueueCorridor {
  readonly id: string;
  readonly queueInstanceId: string;
  readonly from: WorldLinkEndpoint;
  readonly to: WorldLinkEndpoint;
  readonly topologyEdgeIds: readonly [string, string];
}

export interface GeneratedWorld {
  readonly schema: "linxsimcity.generated-world";
  readonly schemaVersion: "1";
  readonly topologyId: string;
  readonly topologyRevision: string;
  readonly topologyFingerprint: string;
  readonly name: string;
  readonly instances: readonly BrickInstance[];
  readonly links: readonly WorldLink[];
  readonly queueCorridors: readonly WorldQueueCorridor[];
}

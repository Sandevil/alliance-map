import { MapState } from '../../domain';

export type DataMode = 'local' | 'cloud';

export interface MapStateRevisionSummary {
  id: string;
  mapId: string;
  schemaVersion: number;
  createdAt: string;
  note?: string;
}

export interface MapStateRevisionRecord extends MapStateRevisionSummary {
  state: MapState;
}

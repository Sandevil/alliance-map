import { MapState } from '../../domain';

export type DataMode = 'local' | 'cloud';
export type MapStage = 'published' | 'draft';
export type MapRevisionEventType = 'autosave' | 'publish' | 'restore';

export interface MapStateRevisionSummary {
  id: string;
  mapId: string;
  stage: MapStage;
  schemaVersion: number;
  createdAt: string;
  note?: string;
  eventType?: MapRevisionEventType;
}

export interface MapStateRevisionRecord extends MapStateRevisionSummary {
  state: MapState;
}

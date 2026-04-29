import { MapState } from '../../domain';

export type DataMode = 'local' | 'cloud';
export type MapStage = 'published' | 'draft';
export type MapRevisionEventType = 'autosave' | 'publish' | 'restore' | 'snapshot';

export interface AppSettingRecord {
  key: string;
  value: string;
  updatedAt?: string;
}

export interface PublishedMapVariantSummary {
  id: string;
  mapId: string;
  variantKey: string;
  createdAt: string;
  label?: string;
  revisionId?: string;
}

export interface MapStateRevisionSummary {
  id: string;
  mapId: string;
  stage: MapStage;
  schemaVersion: number;
  createdAt: string;
  note?: string;
  snapshotName?: string;
  eventType?: MapRevisionEventType;
}

export interface MapStateRevisionRecord extends MapStateRevisionSummary {
  state: MapState;
}

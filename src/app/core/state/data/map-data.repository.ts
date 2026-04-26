import { MapState } from '../../domain';
import { MapRevisionEventType, MapStage, MapStateRevisionRecord, MapStateRevisionSummary } from './map-data.models';

export interface CreateRevisionOptions {
  stage?: MapStage;
  eventType?: MapRevisionEventType;
}

export interface MapDataRepository {
  loadCurrentState(mapId: string, stage?: MapStage): Promise<MapState | null>;
  saveCurrentState(mapId: string, state: MapState, stage?: MapStage): Promise<void>;
  publishDraft(mapId: string, note?: string): Promise<boolean>;
  createRevision(mapId: string, state: MapState, note?: string, options?: CreateRevisionOptions): Promise<MapStateRevisionSummary>;
  listRevisions(mapId: string, stage?: MapStage): Promise<MapStateRevisionSummary[]>;
  loadRevision(mapId: string, revisionId: string, stage?: MapStage): Promise<MapStateRevisionRecord | null>;
}

import { MapState } from '../../domain';
import { MapStateRevisionRecord, MapStateRevisionSummary } from './map-data.models';

export interface MapDataRepository {
  loadCurrentState(mapId: string): Promise<MapState | null>;
  saveCurrentState(mapId: string, state: MapState): Promise<void>;
  createRevision(mapId: string, state: MapState, note?: string): Promise<MapStateRevisionSummary>;
  listRevisions(mapId: string): Promise<MapStateRevisionSummary[]>;
  loadRevision(mapId: string, revisionId: string): Promise<MapStateRevisionRecord | null>;
}

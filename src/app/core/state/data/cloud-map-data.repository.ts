import { MapState } from '../../domain';
import { MapDataRepository } from './map-data.repository';
import { MapStateRevisionRecord, MapStateRevisionSummary } from './map-data.models';

/**
 * Placeholder cloud repository.
 * In a next iteration this class will be backed by Supabase.
 */
export class CloudMapDataRepository implements MapDataRepository {
  async loadCurrentState(_: string): Promise<MapState | null> {
    return null;
  }

  async saveCurrentState(_: string, __: MapState): Promise<void> {
    // no-op placeholder
  }

  async createRevision(mapId: string, state: MapState, note?: string): Promise<MapStateRevisionSummary> {
    return {
      id: `cloud-placeholder-${Date.now()}`,
      mapId,
      schemaVersion: state.schemaVersion,
      createdAt: new Date().toISOString(),
      note,
    };
  }

  async listRevisions(_: string): Promise<MapStateRevisionSummary[]> {
    return [];
  }

  async loadRevision(_: string, __: string): Promise<MapStateRevisionRecord | null> {
    return null;
  }
}

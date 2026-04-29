import { MapState } from '../../domain';
import {
  AppSettingRecord,
  MapRevisionEventType,
  MapStage,
  MapStateRevisionRecord,
  MapStateRevisionSummary,
  PublishedMapVariantSummary,
} from './map-data.models';

export interface CreateRevisionOptions {
  stage?: MapStage;
  eventType?: MapRevisionEventType;
  snapshotName?: string;
}

export interface MapDataRepository {
  loadAppSetting(key: string): Promise<AppSettingRecord | null>;
  saveAppSetting(key: string, value: string): Promise<void>;
  loadCurrentState(mapId: string, stage?: MapStage): Promise<MapState | null>;
  loadPublishedVariantState(mapId: string, variantKey: string): Promise<MapState | null>;
  saveCurrentState(mapId: string, state: MapState, stage?: MapStage): Promise<void>;
  publishDraft(mapId: string, note?: string): Promise<boolean>;
  publishDraftVariant(mapId: string, variantKey: string, label?: string, sourceVariantKey?: string | null): Promise<boolean>;
  listPublishedVariants(mapId: string): Promise<PublishedMapVariantSummary[]>;
  createRevision(mapId: string, state: MapState, note?: string, options?: CreateRevisionOptions): Promise<MapStateRevisionSummary>;
  listRevisions(mapId: string, stage?: MapStage): Promise<MapStateRevisionSummary[]>;
  loadRevision(mapId: string, revisionId: string, stage?: MapStage): Promise<MapStateRevisionRecord | null>;
}

import { MapState } from '../../domain';
import { CreateRevisionOptions, MapDataRepository } from './map-data.repository';
import {
  AppSettingRecord,
  MapRevisionEventType,
  MapStage,
  MapStateRevisionRecord,
  MapStateRevisionSummary,
  PublishedMapVariantSummary,
} from './map-data.models';

type CurrentStateRecord = {
  mapId: string;
  state: MapState;
  updatedAt: string;
};

export class LocalMapDataRepository implements MapDataRepository {
  private static readonly DEFAULT_STAGE: MapStage = 'published';
  private static readonly DB_NAME = 'alliance-map-db';
  private static readonly DB_VERSION = 1;
  private static readonly CURRENT_STORE = 'currentStates';
  private static readonly REVISIONS_STORE = 'revisions';

  private static readonly LS_CURRENT_PREFIX = 'alliance-map.current.';
  private static readonly LS_REVISIONS_PREFIX = 'alliance-map.revisions.';
  private static readonly LS_VARIANTS_PREFIX = 'alliance-map.variants.';
  private static readonly LS_SETTINGS_PREFIX = 'alliance-map.settings.';

  private databasePromise?: Promise<IDBDatabase | null>;

  async loadAppSetting(key: string): Promise<AppSettingRecord | null> {
    const value = this.safeLocalStorageGet(`${LocalMapDataRepository.LS_SETTINGS_PREFIX}${key}`);
    if (value == null) {
      return null;
    }

    return { key, value };
  }

  async saveAppSetting(key: string, value: string): Promise<void> {
    this.safeLocalStorageSet(`${LocalMapDataRepository.LS_SETTINGS_PREFIX}${key}`, value);
  }

  async loadCurrentState(mapId: string, stage: MapStage = LocalMapDataRepository.DEFAULT_STAGE): Promise<MapState | null> {
    const stateKey = this.composeCurrentStateKey(mapId, stage);
    const db = await this.getDatabase();

    if (db) {
      const record = await this.getByKey<CurrentStateRecord>(db, LocalMapDataRepository.CURRENT_STORE, stateKey);
      return record?.state ?? null;
    }

    const raw = this.safeLocalStorageGet(`${LocalMapDataRepository.LS_CURRENT_PREFIX}${stateKey}`);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as MapState;
    } catch {
      return null;
    }
  }

  async loadPublishedVariantState(mapId: string, variantKey: string): Promise<MapState | null> {
    const variants = this.readLocalVariants(mapId);
    const normalizedKey = variantKey.trim().toLowerCase();
    const found = variants.find((item) => item.variantKey.toLowerCase() === normalizedKey);
    return found ? structuredClone(found.state) : null;
  }

  async saveCurrentState(
    mapId: string,
    state: MapState,
    stage: MapStage = LocalMapDataRepository.DEFAULT_STAGE,
  ): Promise<void> {
    const stateKey = this.composeCurrentStateKey(mapId, stage);
    const db = await this.getDatabase();
    const record: CurrentStateRecord = {
      mapId: stateKey,
      state,
      updatedAt: new Date().toISOString(),
    };

    if (db) {
      await this.put(db, LocalMapDataRepository.CURRENT_STORE, record);
      return;
    }

    this.safeLocalStorageSet(`${LocalMapDataRepository.LS_CURRENT_PREFIX}${stateKey}`, JSON.stringify(state));
  }

  async publishDraft(mapId: string, note?: string): Promise<boolean> {
    const draftState = await this.loadCurrentState(mapId, 'draft');
    if (!draftState) {
      return false;
    }

    await this.saveCurrentState(mapId, draftState, 'published');
    await this.createRevision(mapId, draftState, note, {
      stage: 'published',
      eventType: 'publish',
    });
    return true;
  }

  async publishDraftVariant(mapId: string, variantKey: string, label?: string, sourceVariantKey?: string | null): Promise<boolean> {
    const normalizedKey = variantKey.trim().toLowerCase();
    if (!normalizedKey) {
      return false;
    }

    const draftState = await this.loadCurrentState(this.composeDraftMapId(mapId, sourceVariantKey ?? normalizedKey), 'draft');
    if (!draftState) {
      return false;
    }

    const variants = this.readLocalVariants(mapId);
    const now = new Date().toISOString();
    const existingIndex = variants.findIndex((item) => item.variantKey.toLowerCase() === normalizedKey);
    const entry = {
      id: existingIndex >= 0 ? variants[existingIndex].id : `variant-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      mapId,
      variantKey: normalizedKey,
      createdAt: now,
      label: label?.trim() || undefined,
      revisionId: undefined as string | undefined,
      state: structuredClone(draftState),
    };

    const revision = await this.createRevision(this.composeDraftMapId(mapId, sourceVariantKey ?? normalizedKey), draftState, `Variant ${normalizedKey}${label ? ` (${label})` : ''}`, {
      stage: 'published',
      eventType: 'publish',
    });
    entry.revisionId = revision.id;

    if (existingIndex >= 0) {
      variants[existingIndex] = entry;
    } else {
      variants.unshift(entry);
    }

    this.writeLocalVariants(mapId, variants);
    return true;
  }

  async listPublishedVariants(mapId: string): Promise<PublishedMapVariantSummary[]> {
    return this.readLocalVariants(mapId).map((item) => ({
      id: item.id,
      mapId: item.mapId,
      variantKey: item.variantKey,
      createdAt: item.createdAt,
      label: item.label,
      revisionId: item.revisionId,
    }));
  }

  async createRevision(
    mapId: string,
    state: MapState,
    note?: string,
    options?: CreateRevisionOptions,
  ): Promise<MapStateRevisionSummary> {
    const stage = options?.stage ?? LocalMapDataRepository.DEFAULT_STAGE;
    const eventType = options?.eventType;

    const now = new Date().toISOString();
    const revision: MapStateRevisionRecord = {
      id: `rev-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      mapId,
      stage,
      schemaVersion: state.schemaVersion,
      createdAt: now,
      note,
      eventType,
      snapshotName: options?.snapshotName,
      state,
    };

    const db = await this.getDatabase();
    if (db) {
      await this.put(db, LocalMapDataRepository.REVISIONS_STORE, revision);
      return this.toSummary(revision);
    }

    const revisions = this.readLocalRevisions(mapId);
    revisions.unshift(revision);
    this.writeLocalRevisions(mapId, revisions);
    return this.toSummary(revision);
  }

  async listRevisions(mapId: string, stage: MapStage = LocalMapDataRepository.DEFAULT_STAGE): Promise<MapStateRevisionSummary[]> {
    const db = await this.getDatabase();
    if (db) {
      const records = await this.getAllByIndex<MapStateRevisionRecord>(
        db,
        LocalMapDataRepository.REVISIONS_STORE,
        'mapId',
        mapId,
      );

      return records
        .filter((item) => this.normalizeStage(item.stage) === stage)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((item) => this.toSummary(item));
    }

    return this.readLocalRevisions(mapId)
      .filter((item) => this.normalizeStage(item.stage) === stage)
      .map((item) => this.toSummary(item));
  }

  async loadRevision(
    mapId: string,
    revisionId: string,
    stage: MapStage = LocalMapDataRepository.DEFAULT_STAGE,
  ): Promise<MapStateRevisionRecord | null> {
    const db = await this.getDatabase();
    if (db) {
      const record = await this.getByKey<MapStateRevisionRecord>(db, LocalMapDataRepository.REVISIONS_STORE, revisionId);
      return record?.mapId === mapId && this.normalizeStage(record.stage) === stage ? record : null;
    }

    return this.readLocalRevisions(mapId).find((item) => item.id === revisionId && this.normalizeStage(item.stage) === stage) ?? null;
  }

  private async getDatabase(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return null;
    }

    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve) => {
        const request = window.indexedDB.open(LocalMapDataRepository.DB_NAME, LocalMapDataRepository.DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;

          if (!db.objectStoreNames.contains(LocalMapDataRepository.CURRENT_STORE)) {
            db.createObjectStore(LocalMapDataRepository.CURRENT_STORE, { keyPath: 'mapId' });
          }

          if (!db.objectStoreNames.contains(LocalMapDataRepository.REVISIONS_STORE)) {
            const revisions = db.createObjectStore(LocalMapDataRepository.REVISIONS_STORE, { keyPath: 'id' });
            revisions.createIndex('mapId', 'mapId', { unique: false });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      });
    }

    return this.databasePromise;
  }

  private put(db: IDBDatabase, storeName: string, payload: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private getByKey<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  private getAllByIndex<T>(
    db: IDBDatabase,
    storeName: string,
    indexName: string,
    indexKey: IDBValidKey,
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(indexKey);
      request.onsuccess = () => resolve((request.result as T[]) ?? []);
      request.onerror = () => reject(request.error);
    });
  }

  private readLocalRevisions(mapId: string): MapStateRevisionRecord[] {
    const raw = this.safeLocalStorageGet(`${LocalMapDataRepository.LS_REVISIONS_PREFIX}${mapId}`);

    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as MapStateRevisionRecord[]) : [];
    } catch {
      return [];
    }
  }

  private writeLocalRevisions(mapId: string, revisions: MapStateRevisionRecord[]): void {
    this.safeLocalStorageSet(`${LocalMapDataRepository.LS_REVISIONS_PREFIX}${mapId}`, JSON.stringify(revisions));
  }

  private readLocalVariants(mapId: string): Array<PublishedMapVariantSummary & { state: MapState }> {
    const raw = this.safeLocalStorageGet(`${LocalMapDataRepository.LS_VARIANTS_PREFIX}${mapId}`);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as Array<PublishedMapVariantSummary & { state: MapState }>) : [];
    } catch {
      return [];
    }
  }

  private writeLocalVariants(mapId: string, variants: Array<PublishedMapVariantSummary & { state: MapState }>): void {
    this.safeLocalStorageSet(`${LocalMapDataRepository.LS_VARIANTS_PREFIX}${mapId}`, JSON.stringify(variants));
  }

  private toSummary(revision: MapStateRevisionRecord): MapStateRevisionSummary {
    return {
      id: revision.id,
      mapId: revision.mapId,
      stage: this.normalizeStage(revision.stage),
      schemaVersion: revision.schemaVersion,
      createdAt: revision.createdAt,
      note: revision.note,
      snapshotName: revision.snapshotName,
      eventType: this.normalizeEventType(revision.eventType),
    };
  }

  private composeCurrentStateKey(mapId: string, stage: MapStage): string {
    return `${mapId}::${stage}`;
  }

  private composeDraftMapId(mapId: string, variantKey?: string | null): string {
    const normalized = (variantKey ?? '').trim().toLowerCase();
    return normalized ? `${mapId}variant:${normalized}` : mapId;
  }

  private normalizeStage(stage: unknown): MapStage {
    return stage === 'draft' || stage === 'published' ? stage : LocalMapDataRepository.DEFAULT_STAGE;
  }

  private normalizeEventType(eventType: unknown): MapRevisionEventType | undefined {
    if (eventType === 'autosave' || eventType === 'publish' || eventType === 'restore' || eventType === 'snapshot') {
      return eventType;
    }

    return undefined;
  }

  private safeLocalStorageGet(key: string): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private safeLocalStorageSet(key: string, value: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore local persistence write errors.
    }
  }
}

import { MapState } from '../../domain';
import { MapDataRepository } from './map-data.repository';
import { MapStateRevisionRecord, MapStateRevisionSummary } from './map-data.models';

type CurrentStateRecord = {
  mapId: string;
  state: MapState;
  updatedAt: string;
};

export class LocalMapDataRepository implements MapDataRepository {
  private static readonly DB_NAME = 'alliance-map-db';
  private static readonly DB_VERSION = 1;
  private static readonly CURRENT_STORE = 'currentStates';
  private static readonly REVISIONS_STORE = 'revisions';

  private static readonly LS_CURRENT_PREFIX = 'alliance-map.current.';
  private static readonly LS_REVISIONS_PREFIX = 'alliance-map.revisions.';

  private databasePromise?: Promise<IDBDatabase | null>;

  async loadCurrentState(mapId: string): Promise<MapState | null> {
    const db = await this.getDatabase();

    if (db) {
      const record = await this.getByKey<CurrentStateRecord>(db, LocalMapDataRepository.CURRENT_STORE, mapId);
      return record?.state ?? null;
    }

    const raw = this.safeLocalStorageGet(`${LocalMapDataRepository.LS_CURRENT_PREFIX}${mapId}`);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as MapState;
    } catch {
      return null;
    }
  }

  async saveCurrentState(mapId: string, state: MapState): Promise<void> {
    const db = await this.getDatabase();
    const record: CurrentStateRecord = {
      mapId,
      state,
      updatedAt: new Date().toISOString(),
    };

    if (db) {
      await this.put(db, LocalMapDataRepository.CURRENT_STORE, record);
      return;
    }

    this.safeLocalStorageSet(`${LocalMapDataRepository.LS_CURRENT_PREFIX}${mapId}`, JSON.stringify(state));
  }

  async createRevision(mapId: string, state: MapState, note?: string): Promise<MapStateRevisionSummary> {
    const now = new Date().toISOString();
    const revision: MapStateRevisionRecord = {
      id: `rev-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      mapId,
      schemaVersion: state.schemaVersion,
      createdAt: now,
      note,
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

  async listRevisions(mapId: string): Promise<MapStateRevisionSummary[]> {
    const db = await this.getDatabase();
    if (db) {
      const records = await this.getAllByIndex<MapStateRevisionRecord>(
        db,
        LocalMapDataRepository.REVISIONS_STORE,
        'mapId',
        mapId,
      );

      return records
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((item) => this.toSummary(item));
    }

    return this.readLocalRevisions(mapId).map((item) => this.toSummary(item));
  }

  async loadRevision(mapId: string, revisionId: string): Promise<MapStateRevisionRecord | null> {
    const db = await this.getDatabase();
    if (db) {
      const record = await this.getByKey<MapStateRevisionRecord>(db, LocalMapDataRepository.REVISIONS_STORE, revisionId);
      return record?.mapId === mapId ? record : null;
    }

    return this.readLocalRevisions(mapId).find((item) => item.id === revisionId) ?? null;
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

  private toSummary(revision: MapStateRevisionRecord): MapStateRevisionSummary {
    return {
      id: revision.id,
      mapId: revision.mapId,
      schemaVersion: revision.schemaVersion,
      createdAt: revision.createdAt,
      note: revision.note,
    };
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

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MapState } from '../../domain';
import { resolveRuntimeEnv } from '../../config/runtime-env';
import { MapDataRepository } from './map-data.repository';
import { MapStateRevisionRecord, MapStateRevisionSummary } from './map-data.models';

export class CloudMapDataRepository implements MapDataRepository {
  private readonly supabase: SupabaseClient | null;

  constructor() {
    const runtimeEnv = resolveRuntimeEnv();

    if (!runtimeEnv.supabaseUrl || !runtimeEnv.supabaseAnonKey) {
      this.supabase = null;
      return;
    }

    this.supabase = createClient(runtimeEnv.supabaseUrl, runtimeEnv.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  async loadCurrentState(mapId: string): Promise<MapState | null> {
    if (!this.supabase) {
      return null;
    }

    const row = await this.findMapStateRow(mapId);
    return row?.state ?? null;
  }

  async saveCurrentState(mapId: string, state: MapState): Promise<void> {
    if (!this.supabase) {
      return;
    }

    const existing = await this.findMapStateRow(mapId);

    if (existing) {
      const { error } = await this.supabase
        .from('map_states')
        .update({
          state,
          schema_version: state.schemaVersion,
        })
        .eq('id', existing.id);

      if (error) {
        console.error('[CloudMapDataRepository] Failed to update current state', error);
      }
      return;
    }

    const payload: Record<string, unknown> = {
      name: mapId,
      state,
      schema_version: state.schemaVersion,
    };

    const { error } = await this.supabase.from('map_states').insert(payload);
    if (error) {
      console.error('[CloudMapDataRepository] Failed to insert current state', error);
    }
  }

  async createRevision(mapId: string, state: MapState, note?: string): Promise<MapStateRevisionSummary> {
    if (!this.supabase) {
      return this.createFallbackSummary(mapId, state, note);
    }

    const mapStateId = await this.ensureMapStateId(mapId, state);
    if (!mapStateId) {
      return this.createFallbackSummary(mapId, state, note);
    }

    const payload: Record<string, unknown> = {
      map_state_id: mapStateId,
      summary: note,
      state,
      schema_version: state.schemaVersion,
    };

    const { data, error } = await this.supabase
      .from('map_revisions')
      .insert(payload)
      .select('id, schema_version, created_at, summary')
      .single();

    if (error || !data) {
      console.error('[CloudMapDataRepository] Failed to create revision', error);
      return this.createFallbackSummary(mapId, state, note);
    }

    return {
      id: data.id,
      mapId,
      schemaVersion: Number(data.schema_version) || state.schemaVersion,
      createdAt: data.created_at,
      note: data.summary ?? undefined,
    };
  }

  async listRevisions(mapId: string): Promise<MapStateRevisionSummary[]> {
    if (!this.supabase) {
      return [];
    }

    const mapStateRow = await this.findMapStateRow(mapId);
    if (!mapStateRow) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('map_revisions')
      .select('id, schema_version, created_at, summary')
      .eq('map_state_id', mapStateRow.id)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('[CloudMapDataRepository] Failed to list revisions', error);
      return [];
    }

    return data.map((item) => ({
      id: item.id,
      mapId,
      schemaVersion: Number(item.schema_version) || 1,
      createdAt: item.created_at,
      note: item.summary ?? undefined,
    }));
  }

  async loadRevision(mapId: string, revisionId: string): Promise<MapStateRevisionRecord | null> {
    if (!this.supabase) {
      return null;
    }

    const mapStateRow = await this.findMapStateRow(mapId);
    if (!mapStateRow) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('map_revisions')
      .select('id, schema_version, created_at, summary, state')
      .eq('id', revisionId)
      .eq('map_state_id', mapStateRow.id)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.error('[CloudMapDataRepository] Failed to load revision', error);
      }
      return null;
    }

    return {
      id: data.id,
      mapId,
      schemaVersion: Number(data.schema_version) || 1,
      createdAt: data.created_at,
      note: data.summary ?? undefined,
      state: data.state as MapState,
    };
  }

  private async findMapStateRow(mapId: string): Promise<{ id: string; state: MapState } | null> {
    if (!this.supabase) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('map_states')
      .select('id, state, updated_at')
      .eq('name', mapId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[CloudMapDataRepository] Failed to load map state row', error);
      return null;
    }

    let row = data?.[0];

    if (!row) {
      const { data: fallbackData, error: fallbackError } = await this.supabase
        .from('map_states')
        .select('id, state, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (fallbackError) {
        console.error('[CloudMapDataRepository] Failed fallback lookup for map state row', fallbackError);
        return null;
      }

      row = fallbackData?.[0];
    }

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      state: row.state as MapState,
    };
  }

  private async ensureMapStateId(mapId: string, state: MapState): Promise<string | null> {
    const existing = await this.findMapStateRow(mapId);
    if (existing) {
      await this.saveCurrentState(mapId, state);
      return existing.id;
    }

    if (!this.supabase) {
      return null;
    }

    const payload: Record<string, unknown> = {
      name: mapId,
      state,
      schema_version: state.schemaVersion,
    };

    const { data, error } = await this.supabase
      .from('map_states')
      .insert(payload)
      .select('id')
      .single();

    if (error || !data) {
      console.error('[CloudMapDataRepository] Failed to ensure map state id', error);
      return null;
    }

    return data.id;
  }

  private createFallbackSummary(mapId: string, state: MapState, note?: string): MapStateRevisionSummary {
    return {
      id: `cloud-fallback-${Date.now()}`,
      mapId,
      schemaVersion: state.schemaVersion,
      createdAt: new Date().toISOString(),
      note,
    };
  }

}

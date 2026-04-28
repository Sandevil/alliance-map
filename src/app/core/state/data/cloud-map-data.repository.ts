import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MapState } from '../../domain';
import { resolveRuntimeEnv } from '../../config/runtime-env';
import { CreateRevisionOptions, MapDataRepository } from './map-data.repository';
import { MapRevisionEventType, MapStage, MapStateRevisionRecord, MapStateRevisionSummary, PublishedMapVariantSummary } from './map-data.models';

export class CloudMapDataRepository implements MapDataRepository {
  private static readonly DEFAULT_STAGE: MapStage = 'published';
  private static readonly VARIANT_PREFIX = 'variant:';
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

  async loadCurrentState(mapId: string, stage: MapStage = CloudMapDataRepository.DEFAULT_STAGE): Promise<MapState | null> {
    if (!this.supabase) {
      return null;
    }

    const row = await this.findMapStateRow(mapId, stage);
    if (!row) {
      return null;
    }

    if (row.stage !== stage) {
      console.warn('[CloudMapDataRepository] Ignoring map state row with unexpected stage', {
        mapId,
        requestedStage: stage,
        rowStage: row.stage,
      });
      return null;
    }

    return row.state;
  }

  async loadPublishedVariantState(mapId: string, variantKey: string): Promise<MapState | null> {
    const normalizedKey = variantKey.trim().toLowerCase();
    if (!normalizedKey || !this.supabase) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('map_variants')
      .select('map_states!inner(state)')
      .eq('map_name', mapId)
      .eq('variant_key', normalizedKey)
      .maybeSingle();

    const joinedState = (data as { map_states?: Array<{ state?: MapState }> } | null)?.map_states?.[0]?.state;
    if (!error && joinedState) {
      return joinedState;
    }

    const row = await this.findMapStateRow(this.composeVariantMapId(mapId, normalizedKey), 'published', false);
    return row?.state ?? null;
  }

  async saveCurrentState(
    mapId: string,
    state: MapState,
    stage: MapStage = CloudMapDataRepository.DEFAULT_STAGE,
  ): Promise<void> {
    if (!this.supabase) {
      return;
    }

    const existing = await this.findMapStateRow(mapId, stage, false);

    if (existing) {
      const { error } = await this.supabase
        .from('map_states')
        .update({
          state,
          stage,
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
      stage,
      state,
      schema_version: state.schemaVersion,
    };

    const { error } = await this.supabase.from('map_states').insert(payload);
    if (error) {
      console.error('[CloudMapDataRepository] Failed to insert current state', error);
    }
  }

  async publishDraft(mapId: string, note?: string): Promise<boolean> {
    if (!this.supabase) {
      return false;
    }

    const draftRow = await this.findMapStateRow(mapId, 'draft', false);
    if (!draftRow) {
      return false;
    }

    await this.saveCurrentState(mapId, draftRow.state, 'published');
    await this.createRevision(mapId, draftRow.state, note, {
      stage: 'published',
      eventType: 'publish',
    });

    return true;
  }

  async publishDraftVariant(mapId: string, variantKey: string, label?: string): Promise<boolean> {
    const normalizedKey = variantKey.trim().toLowerCase();
    if (!normalizedKey || !this.supabase) {
      return false;
    }

    const draftRow = await this.findMapStateRow(mapId, 'draft', false);
    if (!draftRow) {
      return false;
    }

    const note = `Variant ${normalizedKey}${label?.trim() ? ` (${label.trim()})` : ''}`;

    await this.saveCurrentState(mapId, draftRow.state, 'published');
    const revision = await this.createRevision(mapId, draftRow.state, note, {
      stage: 'published',
      eventType: 'publish',
    });

    const publishedRow = await this.findMapStateRow(mapId, 'published', false);
    if (publishedRow) {
      const { error: upsertError } = await this.supabase
        .from('map_variants')
        .upsert(
          {
            map_name: mapId,
            variant_key: normalizedKey,
            label: label?.trim() || null,
            map_state_id: publishedRow.id,
            revision_id: revision.id,
          },
          { onConflict: 'map_name,variant_key' },
        );

      if (!upsertError) {
        return true;
      }
      console.error('[CloudMapDataRepository] Failed upsert into map_variants, using fallback map name convention', upsertError);
    }

    const variantMapId = this.composeVariantMapId(mapId, normalizedKey);
    await this.saveCurrentState(variantMapId, draftRow.state, 'published');

    return true;
  }

  async listPublishedVariants(mapId: string): Promise<PublishedMapVariantSummary[]> {
    if (!this.supabase) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('map_variants')
      .select('id, map_name, variant_key, label, revision_id, created_at')
      .eq('map_name', mapId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data.map((item) => ({
        id: item.id,
        mapId: item.map_name,
        variantKey: item.variant_key,
        createdAt: item.created_at,
        label: item.label ?? undefined,
        revisionId: item.revision_id ?? undefined,
      }));
    }

    const variantPrefix = this.composeVariantMapId(mapId, '');
    const { data: fallbackData, error: fallbackError } = await this.supabase
      .from('map_states')
      .select('id, name, updated_at')
      .eq('stage', 'published')
      .like('name', `${variantPrefix}%`)
      .order('updated_at', { ascending: false });

    if (fallbackError || !fallbackData) {
      console.error('[CloudMapDataRepository] Failed to list published variants', fallbackError);
      return [];
    }

    return fallbackData.map((item) => {
      const variantKey = (item.name as string).slice(variantPrefix.length);
      return {
        id: item.id,
        mapId,
        variantKey,
        createdAt: item.updated_at,
      };
    });
  }

  async createRevision(
    mapId: string,
    state: MapState,
    note?: string,
    options?: CreateRevisionOptions,
  ): Promise<MapStateRevisionSummary> {
    const stage = options?.stage ?? CloudMapDataRepository.DEFAULT_STAGE;
    const eventType = options?.eventType;

    if (!this.supabase) {
      return this.createFallbackSummary(mapId, state, note, stage, eventType);
    }

    const mapStateId = await this.ensureMapStateId(mapId, state, stage);
    if (!mapStateId) {
      return this.createFallbackSummary(mapId, state, note, stage, eventType);
    }

    const payload: Record<string, unknown> = {
      map_state_id: mapStateId,
      summary: note,
      stage,
      event_type: eventType,
      state,
      schema_version: state.schemaVersion,
    };

    const { data, error } = await this.supabase
      .from('map_revisions')
      .insert(payload)
      .select('id, schema_version, created_at, summary, stage, event_type')
      .single();

    if (error || !data) {
      console.error('[CloudMapDataRepository] Failed to create revision', error);
      return this.createFallbackSummary(mapId, state, note, stage, eventType);
    }

    return {
      id: data.id,
      mapId,
      stage: this.normalizeStage(data.stage, stage),
      schemaVersion: Number(data.schema_version) || state.schemaVersion,
      createdAt: data.created_at,
      note: data.summary ?? undefined,
      eventType: this.normalizeEventType(data.event_type),
    };
  }

  async listRevisions(mapId: string, stage: MapStage = CloudMapDataRepository.DEFAULT_STAGE): Promise<MapStateRevisionSummary[]> {
    if (!this.supabase) {
      return [];
    }

    const mapStateRow = await this.findMapStateRow(mapId, stage, false);
    if (!mapStateRow) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('map_revisions')
      .select('id, schema_version, created_at, summary, stage, event_type')
      .eq('map_state_id', mapStateRow.id)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('[CloudMapDataRepository] Failed to list revisions', error);
      return [];
    }

    return data.map((item) => ({
      id: item.id,
      mapId,
      stage: this.normalizeStage(item.stage, stage),
      schemaVersion: Number(item.schema_version) || 1,
      createdAt: item.created_at,
      note: item.summary ?? undefined,
      eventType: this.normalizeEventType(item.event_type),
    }));
  }

  async loadRevision(
    mapId: string,
    revisionId: string,
    stage: MapStage = CloudMapDataRepository.DEFAULT_STAGE,
  ): Promise<MapStateRevisionRecord | null> {
    if (!this.supabase) {
      return null;
    }

    const mapStateRow = await this.findMapStateRow(mapId, stage, false);
    if (!mapStateRow) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('map_revisions')
      .select('id, schema_version, created_at, summary, stage, event_type, state')
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
      stage: this.normalizeStage(data.stage, stage),
      schemaVersion: Number(data.schema_version) || 1,
      createdAt: data.created_at,
      note: data.summary ?? undefined,
      eventType: this.normalizeEventType(data.event_type),
      state: data.state as MapState,
    };
  }

  private async findMapStateRow(
    mapId: string,
    stage: MapStage = CloudMapDataRepository.DEFAULT_STAGE,
    allowGlobalPublishedFallback = stage === 'published',
  ): Promise<{ id: string; state: MapState; stage: MapStage } | null> {
    if (!this.supabase) {
      return null;
    }

    type MapStateQueryRow = { id: string; state: unknown; updated_at: string; stage: unknown };

    const { data, error } = await this.supabase
      .from('map_states')
      .select('id, state, updated_at, stage')
      .eq('name', mapId)
      .eq('stage', stage)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[CloudMapDataRepository] Failed to load map state row', error);
      return null;
    }

    let row: MapStateQueryRow | null = (data?.[0] as MapStateQueryRow | undefined) ?? null;

    if (!row && stage === 'published') {
      const { data: legacyByNameData, error: legacyByNameError } = await this.supabase
        .from('map_states')
        .select('id, state, updated_at, stage')
        .eq('name', mapId)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (legacyByNameError) {
        console.error('[CloudMapDataRepository] Failed legacy by-name lookup for map state row', legacyByNameError);
        return null;
      }

      row =
        (legacyByNameData as MapStateQueryRow[] | null | undefined)?.find((candidate) =>
          this.matchesRequestedStage(candidate?.stage, stage, {
            allowLegacyPublishedStage: true,
          }),
        ) ?? null;
    }

    if (!row && allowGlobalPublishedFallback) {
      const { data: fallbackData, error: fallbackError } = await this.supabase
        .from('map_states')
        .select('id, state, updated_at, stage')
        .eq('stage', 'published')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (fallbackError) {
        console.error('[CloudMapDataRepository] Failed fallback lookup for map state row', fallbackError);
        return null;
      }

      row = ((fallbackData as MapStateQueryRow[] | null | undefined)?.[0] as MapStateQueryRow | undefined) ?? null;
    }

    if (!row && allowGlobalPublishedFallback) {
      const { data: finalFallbackData, error: finalFallbackError } = await this.supabase
        .from('map_states')
        .select('id, state, updated_at, stage')
        .order('updated_at', { ascending: false })
        .limit(25);

      if (finalFallbackError) {
        console.error('[CloudMapDataRepository] Failed final fallback lookup for map state row', finalFallbackError);
        return null;
      }

      row =
        (finalFallbackData as MapStateQueryRow[] | null | undefined)?.find((candidate) =>
          this.matchesRequestedStage(candidate?.stage, stage, {
            allowLegacyPublishedStage: true,
          }),
        ) ?? null;
    }

    if (!row || !this.matchesRequestedStage(row.stage, stage, { allowLegacyPublishedStage: true })) {
      return null;
    }

    return {
      id: row.id,
      state: row.state as MapState,
      stage: this.normalizeStage(row.stage, stage),
    };
  }

  private matchesRequestedStage(
    rowStage: unknown,
    requestedStage: MapStage,
    options?: { allowLegacyPublishedStage?: boolean },
  ): boolean {
    if (requestedStage === 'draft') {
      return rowStage === 'draft';
    }

    if (rowStage === 'published') {
      return true;
    }

    return !!options?.allowLegacyPublishedStage && (rowStage === null || rowStage === undefined || rowStage === '');
  }

  private async ensureMapStateId(mapId: string, state: MapState, stage: MapStage): Promise<string | null> {
    const existing = await this.findMapStateRow(mapId, stage, false);
    if (existing) {
      await this.saveCurrentState(mapId, state, stage);
      return existing.id;
    }

    if (!this.supabase) {
      return null;
    }

    const payload: Record<string, unknown> = {
      name: mapId,
      stage,
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

  private createFallbackSummary(
    mapId: string,
    state: MapState,
    note: string | undefined,
    stage: MapStage,
    eventType?: MapRevisionEventType,
  ): MapStateRevisionSummary {
    return {
      id: `cloud-fallback-${Date.now()}`,
      mapId,
      stage,
      schemaVersion: state.schemaVersion,
      createdAt: new Date().toISOString(),
      note,
      eventType,
    };
  }

  private normalizeStage(stage: unknown, fallback: MapStage): MapStage {
    return stage === 'draft' || stage === 'published' ? stage : fallback;
  }

  private normalizeEventType(eventType: unknown): MapRevisionEventType | undefined {
    if (eventType === 'autosave' || eventType === 'publish' || eventType === 'restore') {
      return eventType;
    }

    return undefined;
  }

  private composeVariantMapId(mapId: string, variantKey: string): string {
    return `${mapId}${CloudMapDataRepository.VARIANT_PREFIX}${variantKey}`;
  }

}

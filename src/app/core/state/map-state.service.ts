import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import {
  Coord,
  GRID_MIN_SIZE,
  GeneralPlayerListKey,
  Player,
  ResizeAnchor,
  createInitialMapState,
  MapState,
  PlayerInput,
  PlayerListKey,
  RuleValidationResult,
  SCHEMA_VERSION,
  TILE_RULES,
  TilePlacement,
  addPlayerToGeneralList,
  movePlayerBetweenLists,
  returnPlayerToHomeGeneralList,
  validatePlacement,
} from '../domain';
import { MAP_DATA_REPOSITORY } from './data/map-data.tokens';
import { MapDataRepository } from './data/map-data.repository';

@Injectable({ providedIn: 'root' })
export class MapStateService {
  private static readonly LEGACY_STORAGE_KEY = 'alliance-map.state.v1';
  private static readonly DEFAULT_MAP_ID = 'default';

  private readonly dataRepository = inject(MAP_DATA_REPOSITORY) as MapDataRepository;

  private readonly stateSubject = new BehaviorSubject<MapState>(createInitialMapState());

  readonly state$ = this.stateSubject.asObservable();

  constructor() {
    void this.hydrateFromRepository();

    this.state$.subscribe((state) => {
      void this.dataRepository.saveCurrentState(MapStateService.DEFAULT_MAP_ID, state);
    });
  }

  get snapshot(): MapState {
    return this.stateSubject.value;
  }

  reset(): void {
    this.stateSubject.next(createInitialMapState());
  }

  addPlayer(input: PlayerInput): RuleValidationResult {
    const next = this.cloneState();
    const result = addPlayerToGeneralList(next, input);

    if (result.ok) {
      this.stateSubject.next(next);
    }

    return result;
  }

  updateExternalReference(anchorInternal: Coord, anchorExternal: Coord): RuleValidationResult {
    const values = [anchorInternal.x, anchorInternal.y, anchorExternal.x, anchorExternal.y];
    if (values.some((value) => !Number.isFinite(value))) {
      return {
        ok: false,
        errors: [{ code: 'INVALID_MAP_STATE', message: 'External reference coordinates are invalid.' }],
      };
    }

    const next = this.cloneState();
    next.settings.externalReference = {
      anchorInternal: {
        x: Math.floor(anchorInternal.x),
        y: Math.floor(anchorInternal.y),
      },
      anchorExternal: {
        x: Math.floor(anchorExternal.x),
        y: Math.floor(anchorExternal.y),
      },
    };

    this.stateSubject.next(next);
    return { ok: true, errors: [] };
  }

  resizeGrid(nextWidth: number, nextHeight: number, anchor: ResizeAnchor): RuleValidationResult {
    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) {
      return {
        ok: false,
        errors: [{ code: 'INVALID_MAP_STATE', message: 'Invalid grid size.' }],
      };
    }

    const width = Math.floor(nextWidth);
    const height = Math.floor(nextHeight);

    if (width < GRID_MIN_SIZE || height < GRID_MIN_SIZE) {
      return {
        ok: false,
        errors: [{ code: 'GRID_TOO_SMALL', message: `Grid must be at least ${GRID_MIN_SIZE}x${GRID_MIN_SIZE}.` }],
      };
    }

    const next = this.cloneState();
    const previousWidth = next.settings.grid.width;
    const previousHeight = next.settings.grid.height;

    const shiftX = anchor.endsWith('right') ? width - previousWidth : 0;
    const shiftY = anchor.startsWith('bottom') ? height - previousHeight : 0;

    next.settings.grid.width = width;
    next.settings.grid.height = height;

    const retainedPlacements: typeof next.placements = [];

    for (const placement of next.placements) {
      const moved = {
        ...placement,
        origin: {
          x: placement.origin.x + shiftX,
          y: placement.origin.y + shiftY,
        },
      };

      const inBounds =
        moved.origin.x >= 0 &&
        moved.origin.y >= 0 &&
        moved.origin.x + moved.size.w <= width &&
        moved.origin.y + moved.size.h <= height;

      if (!inBounds) {
        if (moved.type === 'city' && moved.playerId) {
          returnPlayerToHomeGeneralList(next, moved.playerId);
        }
        continue;
      }

      retainedPlacements.push(moved);
    }

    next.placements = retainedPlacements;
    this.stateSubject.next(next);
    return { ok: true, errors: [] };
  }

  upsertPlayersByName(
    players: Array<{ name: string; power: number; targetGeneralList?: GeneralPlayerListKey }>,
    options?: { moveUpdatedToTargetGeneral?: boolean },
  ): { ok: boolean; errors: RuleValidationResult['errors']; summary: { created: number; updated: number; skipped: number } } {
    const next = this.cloneState();
    const summary = { created: 0, updated: 0, skipped: 0 };

    const normalize = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

    const lists: PlayerListKey[] = ['trap1Main', 'trap2Main', 'trap1General', 'trap2General'];
    const indexByName = new Map<string, { list: PlayerListKey; player: Player }>();

    for (const list of lists) {
      for (const player of next.players[list]) {
        const key = normalize(player.name);
        if (!indexByName.has(key)) {
          indexByName.set(key, { list, player });
        }
      }
    }

    for (const item of players) {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const power = item.power;
      const targetGeneralList = item.targetGeneralList ?? 'trap1General';

      if (!name || !Number.isFinite(power) || power < 0) {
        summary.skipped += 1;
        continue;
      }

      const key = normalize(name);
      const found = indexByName.get(key);

      if (found) {
        found.player.name = name;
        found.player.power = power;

        if (options?.moveUpdatedToTargetGeneral && found.list !== targetGeneralList) {
          const moveResult = movePlayerBetweenLists(next, found.player.id, targetGeneralList);
          if (!moveResult.ok) {
            summary.skipped += 1;
            continue;
          }

          found.list = targetGeneralList;
        }

        indexByName.set(key, found);
        summary.updated += 1;
        continue;
      }

      const playerId = `p-${Date.now()}-${Math.round(Math.random() * 1000)}-${summary.created}`;
      const addResult = addPlayerToGeneralList(next, {
        id: playerId,
        name,
        power,
        targetGeneralList,
      });

      if (!addResult.ok) {
        summary.skipped += 1;
        continue;
      }

      const createdPlayer = next.players[targetGeneralList].find((player) => player.id === playerId);
      if (createdPlayer) {
        indexByName.set(key, { list: targetGeneralList, player: createdPlayer });
      }
      summary.created += 1;
    }

    this.stateSubject.next(next);
    return { ok: true, errors: [], summary };
  }

  exportState(): MapState {
    return this.cloneState();
  }

  importState(rawState: unknown): RuleValidationResult {
    const validation = this.validateImportedState(rawState);

    if (!validation.ok || !validation.state) {
      return {
        ok: false,
        errors: validation.errors,
      };
    }

    this.stateSubject.next(validation.state);
    return { ok: true, errors: [] };
  }

  updatePlayer(playerId: string, patch: { name: string; power: number }): RuleValidationResult {
    const next = this.cloneState();

    if (!patch.name.trim()) {
      return {
        ok: false,
        errors: [{ code: 'INVALID_PLAYER_NAME', message: 'Player name is required.' }],
      };
    }

    if (!Number.isFinite(patch.power) || patch.power < 0) {
      return {
        ok: false,
        errors: [{ code: 'INVALID_PLAYER_POWER', message: 'Player power is invalid.' }],
      };
    }

    const lists: PlayerListKey[] = ['trap1Main', 'trap2Main', 'trap1General', 'trap2General'];
    let updated = false;

    for (const list of lists) {
      next.players[list] = next.players[list].map((player) => {
        if (player.id !== playerId) {
          return player;
        }

        updated = true;
        return {
          ...player,
          name: patch.name.trim(),
          power: patch.power,
        };
      });
    }

    if (!updated) {
      return {
        ok: false,
        errors: [{ code: 'PLAYER_NOT_FOUND', message: `Player ${playerId} not found.` }],
      };
    }

    this.stateSubject.next(next);
    return { ok: true, errors: [] };
  }

  removePlayer(playerId: string): RuleValidationResult {
    const next = this.cloneState();
    const lists: PlayerListKey[] = ['trap1Main', 'trap2Main', 'trap1General', 'trap2General'];

    let removed = false;

    for (const list of lists) {
      const currentLength = next.players[list].length;
      next.players[list] = next.players[list].filter((player) => player.id !== playerId);
      if (next.players[list].length !== currentLength) {
        removed = true;
      }
    }

    if (!removed) {
      return {
        ok: false,
        errors: [{ code: 'PLAYER_NOT_FOUND', message: `Player ${playerId} not found.` }],
      };
    }

    next.placements = next.placements.filter((placement) => !(placement.type === 'city' && placement.playerId === playerId));
    this.stateSubject.next(next);

    return { ok: true, errors: [] };
  }

  movePlayer(playerId: string, to: PlayerListKey): RuleValidationResult {
    const next = this.cloneState();
    const result = movePlayerBetweenLists(next, playerId, to);

    if (result.ok) {
      this.stateSubject.next(next);
    }

    return result;
  }

  returnPlayerToHome(playerId: string): RuleValidationResult {
    const next = this.cloneState();
    const result = returnPlayerToHomeGeneralList(next, playerId);

    if (result.ok) {
      this.stateSubject.next(next);
    }

    return result;
  }

  addPlacement(placement: TilePlacement): RuleValidationResult {
    const next = this.cloneState();
    const validation = validatePlacement(placement, next);

    if (!validation.ok) {
      return validation;
    }

    next.placements = [...next.placements, placement];
    this.stateSubject.next(next);

    return validation;
  }

  removePlacement(placementId: string): void {
    const next = this.cloneState();
    const target = next.placements.find((placement) => placement.id === placementId);

    if (!target) {
      return;
    }

    next.placements = next.placements.filter((placement) => placement.id !== placementId);

    if (target.type === 'city' && target.playerId) {
      returnPlayerToHomeGeneralList(next, target.playerId);
    }

    this.stateSubject.next(next);
  }

  movePlacement(placementId: string, origin: Coord): RuleValidationResult {
    const next = this.cloneState();
    const index = next.placements.findIndex((placement) => placement.id === placementId);

    if (index < 0) {
      return {
        ok: false,
        errors: [{ code: 'PLAYER_NOT_FOUND', message: `Placement ${placementId} not found.` }],
      };
    }

    const current = next.placements[index];
    const moved: TilePlacement = {
      ...current,
      origin,
    };

    const validation = validatePlacement(moved, next);
    if (!validation.ok) {
      return validation;
    }

    next.placements[index] = moved;
    this.stateSubject.next(next);

    return validation;
  }

  private async hydrateFromRepository(): Promise<void> {
    const repositoryState = await this.dataRepository.loadCurrentState(MapStateService.DEFAULT_MAP_ID);
    const sourceState = repositoryState ?? this.hydrateFromLegacyStorage();

    if (!sourceState) {
      return;
    }

    const validation = this.validateImportedState(sourceState);
    if (!validation.ok || !validation.state) {
      return;
    }

    this.stateSubject.next(validation.state);

    if (!repositoryState) {
      await this.dataRepository.saveCurrentState(MapStateService.DEFAULT_MAP_ID, validation.state);
    }
  }

  private hydrateFromLegacyStorage(): unknown {
    if (typeof window === 'undefined') {
      return null;
    }

    const raw = window.localStorage.getItem(MapStateService.LEGACY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  private validateImportedState(rawState: unknown): {
    ok: boolean;
    errors: RuleValidationResult['errors'];
    state?: MapState;
  } {
    const migrated = this.migrateToCurrentSchema(rawState);
    if (!migrated.ok || !migrated.state) {
      return {
        ok: migrated.ok,
        errors: migrated.errors,
      };
    }

    const parsed = migrated.state;

    if (!this.isFiniteNumber(parsed.settings?.grid?.width) || !this.isFiniteNumber(parsed.settings?.grid?.height)) {
      return {
        ok: false,
        errors: [{ code: 'INVALID_MAP_STATE', message: 'Grid dimensions are invalid.' }],
      };
    }

    if (parsed.settings.grid.width < GRID_MIN_SIZE || parsed.settings.grid.height < GRID_MIN_SIZE) {
      return {
        ok: false,
        errors: [{ code: 'GRID_TOO_SMALL', message: `Grid must be at least ${GRID_MIN_SIZE}x${GRID_MIN_SIZE}.` }],
      };
    }

    const listKeys: PlayerListKey[] = ['trap1Main', 'trap2Main', 'trap1General', 'trap2General'];
    const allPlayerIds = new Set<string>();

    for (const key of listKeys) {
      const list = parsed.players?.[key];
      if (!Array.isArray(list)) {
        return {
          ok: false,
          errors: [{ code: 'INVALID_MAP_STATE', message: `Player list ${key} is invalid.` }],
        };
      }

      for (const player of list) {
        if (
          !player ||
          typeof player.id !== 'string' ||
          typeof player.name !== 'string' ||
          !this.isFiniteNumber(player.power) ||
          player.power < 0 ||
          (player.homeGeneralList !== 'trap1General' && player.homeGeneralList !== 'trap2General')
        ) {
          return {
            ok: false,
            errors: [{ code: 'INVALID_MAP_STATE', message: 'Player data is invalid.' }],
          };
        }

        if (allPlayerIds.has(player.id)) {
          return {
            ok: false,
            errors: [{ code: 'PLAYER_DUPLICATED', message: `Duplicated player ${player.id}.` }],
          };
        }

        allPlayerIds.add(player.id);
      }
    }

    if (!Array.isArray(parsed.placements)) {
      return {
        ok: false,
        errors: [{ code: 'INVALID_MAP_STATE', message: 'Placements are invalid.' }],
      };
    }

    const validationState: MapState = {
      ...parsed,
      placements: [],
    };

    for (const placement of parsed.placements) {
      if (!placement || typeof placement.id !== 'string' || !this.isRecord(placement.origin) || !this.isRecord(placement.size)) {
        return {
          ok: false,
          errors: [{ code: 'INVALID_MAP_STATE', message: 'Placement data is invalid.' }],
        };
      }

      if (!Object.hasOwn(TILE_RULES, placement.type)) {
        return {
          ok: false,
          errors: [{ code: 'INVALID_MAP_STATE', message: `Unknown tile type: ${placement.type}.` }],
        };
      }

      const result = validatePlacement(placement, validationState);
      if (!result.ok) {
        return {
          ok: false,
          errors: result.errors,
        };
      }

      validationState.placements.push(placement);
    }

    return {
      ok: true,
      errors: [],
      state: parsed,
    };
  }

  private migrateToCurrentSchema(rawState: unknown): {
    ok: boolean;
    errors: RuleValidationResult['errors'];
    state?: MapState;
  } {
    if (!this.isRecord(rawState)) {
      return {
        ok: false,
        errors: [{ code: 'INVALID_MAP_STATE', message: 'Invalid map state.' }],
      };
    }

    const schemaVersion = this.isFiniteNumber(rawState['schemaVersion']) ? rawState['schemaVersion'] : 0;

    if (schemaVersion > SCHEMA_VERSION || schemaVersion < 0) {
      return {
        ok: false,
        errors: [{ code: 'INVALID_SCHEMA_VERSION', message: `Unsupported schema version: ${schemaVersion}.` }],
      };
    }

    if (schemaVersion === SCHEMA_VERSION) {
      return {
        ok: true,
        errors: [],
        state: structuredClone(rawState) as unknown as MapState,
      };
    }

    // v0 -> v1 migration (legacy snapshots without schemaVersion and/or missing optional blocks)
    if (schemaVersion === 0 && SCHEMA_VERSION === 1) {
      return {
        ok: true,
        errors: [],
        state: this.migrateV0ToV1(rawState),
      };
    }

    return {
      ok: false,
      errors: [{ code: 'INVALID_SCHEMA_VERSION', message: `No migration path for schema ${schemaVersion}.` }],
    };
  }

  private migrateV0ToV1(rawState: Record<string, unknown>): MapState {
    const base = createInitialMapState();
    const settings = this.isRecord(rawState['settings']) ? rawState['settings'] : {};
    const grid = this.isRecord(settings['grid']) ? settings['grid'] : {};
    const externalReference = this.isRecord(settings['externalReference']) ? settings['externalReference'] : {};
    const anchorInternal = this.isRecord(externalReference['anchorInternal']) ? externalReference['anchorInternal'] : {};
    const anchorExternal = this.isRecord(externalReference['anchorExternal']) ? externalReference['anchorExternal'] : {};

    const playersRoot = this.isRecord(rawState['players']) ? rawState['players'] : {};
    const trap1Main = Array.isArray(playersRoot['trap1Main']) ? playersRoot['trap1Main'] : [];
    const trap2Main = Array.isArray(playersRoot['trap2Main']) ? playersRoot['trap2Main'] : [];
    const trap1General = Array.isArray(playersRoot['trap1General']) ? playersRoot['trap1General'] : [];
    const trap2General = Array.isArray(playersRoot['trap2General']) ? playersRoot['trap2General'] : [];

    const mapPlayers = (list: unknown[], listKey: PlayerListKey): Player[] =>
      list
        .filter((item) => this.isRecord(item))
        .map((player) => {
          const homeGeneralList: GeneralPlayerListKey =
            player['homeGeneralList'] === 'trap1General' || player['homeGeneralList'] === 'trap2General'
              ? player['homeGeneralList']
              : listKey === 'trap2General' || listKey === 'trap2Main'
                ? 'trap2General'
                : 'trap1General';

          return {
            id: typeof player['id'] === 'string' ? player['id'] : `legacy-${Date.now()}-${Math.round(Math.random() * 1000)}`,
            name: typeof player['name'] === 'string' ? player['name'] : 'Legacy Player',
            power: this.isFiniteNumber(player['power']) && player['power'] >= 0 ? player['power'] : 0,
            homeGeneralList,
          };
        });

    const placements = Array.isArray(rawState['placements'])
      ? rawState['placements'].filter((item) => this.isRecord(item)).map((placement) => ({
          id: typeof placement['id'] === 'string' ? placement['id'] : `legacy-placement-${Date.now()}`,
          type: placement['type'] as TilePlacement['type'],
          origin: this.isRecord(placement['origin'])
            ? {
                x: this.isFiniteNumber(placement['origin']['x']) ? placement['origin']['x'] : 0,
                y: this.isFiniteNumber(placement['origin']['y']) ? placement['origin']['y'] : 0,
              }
            : { x: 0, y: 0 },
          size: this.isRecord(placement['size'])
            ? {
                w: this.isFiniteNumber(placement['size']['w']) ? placement['size']['w'] : 1,
                h: this.isFiniteNumber(placement['size']['h']) ? placement['size']['h'] : 1,
              }
            : { w: 1, h: 1 },
          ...(typeof placement['playerId'] === 'string' ? { playerId: placement['playerId'] } : {}),
        }))
      : [];

    return {
      schemaVersion: SCHEMA_VERSION,
      settings: {
        grid: {
          width: this.isFiniteNumber(grid['width']) ? grid['width'] : base.settings.grid.width,
          height: this.isFiniteNumber(grid['height']) ? grid['height'] : base.settings.grid.height,
        },
        externalReference: {
          anchorInternal: {
            x: this.isFiniteNumber(anchorInternal['x']) ? anchorInternal['x'] : base.settings.externalReference.anchorInternal.x,
            y: this.isFiniteNumber(anchorInternal['y']) ? anchorInternal['y'] : base.settings.externalReference.anchorInternal.y,
          },
          anchorExternal: {
            x: this.isFiniteNumber(anchorExternal['x']) ? anchorExternal['x'] : base.settings.externalReference.anchorExternal.x,
            y: this.isFiniteNumber(anchorExternal['y']) ? anchorExternal['y'] : base.settings.externalReference.anchorExternal.y,
          },
        },
      },
      players: {
        trap1Main: mapPlayers(trap1Main, 'trap1Main'),
        trap2Main: mapPlayers(trap2Main, 'trap2Main'),
        trap1General: mapPlayers(trap1General, 'trap1General'),
        trap2General: mapPlayers(trap2General, 'trap2General'),
      },
      placements,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private cloneState(): MapState {
    return structuredClone(this.snapshot);
  }
}

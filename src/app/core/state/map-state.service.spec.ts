import { TestBed } from '@angular/core/testing';

import { MapState, TILE_RULES } from '../domain';
import { MAP_DATA_REPOSITORY } from './data/map-data.tokens';
import { MapStateRevisionRecord, MapStateRevisionSummary } from './data/map-data.models';
import { MapDataRepository } from './data/map-data.repository';
import { MapStateService } from './map-state.service';

class InMemoryMapDataRepository implements MapDataRepository {
  private current = new Map<string, MapState>();

  async loadCurrentState(mapId: string): Promise<MapState | null> {
    return this.current.get(mapId) ?? null;
  }

  async saveCurrentState(mapId: string, state: MapState): Promise<void> {
    this.current.set(mapId, structuredClone(state));
  }

  async createRevision(mapId: string, state: MapState, note?: string): Promise<MapStateRevisionSummary> {
    const revision: MapStateRevisionSummary = {
      id: `rev-${Date.now()}`,
      mapId,
      schemaVersion: state.schemaVersion,
      createdAt: new Date().toISOString(),
      note,
    };

    return revision;
  }

  async listRevisions(_mapId: string): Promise<MapStateRevisionSummary[]> {
    return [];
  }

  async loadRevision(_mapId: string, _revisionId: string): Promise<MapStateRevisionRecord | null> {
    return null;
  }
}

describe('MapStateService', () => {
  let service: MapStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MapStateService,
        {
          provide: MAP_DATA_REPOSITORY,
          useValue: new InMemoryMapDataRepository(),
        },
      ],
    });

    service = TestBed.inject(MapStateService);
    service.reset();
  });

  it('resizes grid from top-right keeping right side anchored', () => {
    service.addPlacement({
      id: 'banner-1',
      type: 'banner',
      origin: { x: 0, y: 0 },
      size: TILE_RULES.banner.size,
    });

    const previousWidth = service.snapshot.settings.grid.width;
    const nextWidth = previousWidth + 3;

    const result = service.resizeGrid(nextWidth, service.snapshot.settings.grid.height, 'top-right');

    expect(result.ok).toBeTrue();
    expect(service.snapshot.placements[0]?.origin.x).toBe(3);
    expect(service.snapshot.placements[0]?.origin.y).toBe(0);
  });

  it('returns removed city player to home list when resize pushes city out of bounds', () => {
    service.addPlayer({
      id: 'p1',
      name: 'Player One',
      power: 100,
      targetGeneralList: 'trap1General',
    });
    service.movePlayer('p1', 'trap1Main');

    const grid = service.snapshot.settings.grid;

    service.addPlacement({
      id: 'city-1',
      type: 'city',
      origin: { x: grid.width - 2, y: grid.height - 2 },
      size: TILE_RULES.city.size,
      playerId: 'p1',
    });

    const result = service.resizeGrid(grid.width - 1, grid.height - 1, 'top-left');

    expect(result.ok).toBeTrue();
    expect(service.snapshot.placements.some((placement) => placement.id === 'city-1')).toBeFalse();
    expect(service.snapshot.players.trap1Main.some((player) => player.id === 'p1')).toBeFalse();
    expect(service.snapshot.players.trap1General.some((player) => player.id === 'p1')).toBeTrue();
  });

  it('upserts players by normalized name (update existing and create new)', () => {
    service.addPlayer({
      id: 'existing-1',
      name: '  Alice   Prime  ',
      power: 10,
      targetGeneralList: 'trap1General',
    });

    const result = service.upsertPlayersByName([
      { name: 'alice prime', power: 999, targetGeneralList: 'trap2General' },
      { name: 'Bob', power: 77, targetGeneralList: 'trap2General' },
      { name: ' ', power: 5, targetGeneralList: 'trap1General' },
    ]);

    expect(result.ok).toBeTrue();
    expect(result.summary.updated).toBe(1);
    expect(result.summary.created).toBe(1);
    expect(result.summary.skipped).toBe(1);

    const alice = [
      ...service.snapshot.players.trap1General,
      ...service.snapshot.players.trap2General,
      ...service.snapshot.players.trap1Main,
      ...service.snapshot.players.trap2Main,
    ].find((player) => player.id === 'existing-1');

    expect(alice?.name).toBe('alice prime');
    expect(alice?.power).toBe(999);
    expect(service.snapshot.players.trap2General.some((player) => player.name === 'Bob')).toBeTrue();
  });

  it('moves updated player to target general list when option is enabled', () => {
    service.addPlayer({
      id: 'p-move',
      name: 'Mover',
      power: 1,
      targetGeneralList: 'trap1General',
    });
    service.movePlayer('p-move', 'trap1Main');

    const result = service.upsertPlayersByName(
      [{ name: ' mover ', power: 200, targetGeneralList: 'trap2General' }],
      { moveUpdatedToTargetGeneral: true },
    );

    expect(result.ok).toBeTrue();
    expect(result.summary.updated).toBe(1);
    expect(service.snapshot.players.trap1Main.some((player) => player.id === 'p-move')).toBeFalse();
    expect(service.snapshot.players.trap2General.some((player) => player.id === 'p-move')).toBeTrue();
  });
});

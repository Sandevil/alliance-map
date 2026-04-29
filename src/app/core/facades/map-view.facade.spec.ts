import { TestBed } from '@angular/core/testing';

import { createInitialMapState, MapState } from '../domain';
import { MAP_DATA_REPOSITORY } from '../state/data/map-data.tokens';
import { MapDataRepository } from '../state/data/map-data.repository';
import { MapViewFacade } from './map-view.facade';

class MapViewLegacyRepositoryStub implements MapDataRepository {
  async loadAppSetting(): Promise<null> {
    return null;
  }

  async saveAppSetting(): Promise<void> {
    return;
  }

  async loadCurrentState(): Promise<MapState | null> {
    const legacy = createInitialMapState() as unknown as {
      players: Record<string, unknown>;
    };

    delete legacy.players['noTrapGeneral'];

    return legacy as unknown as MapState;
  }

  async saveCurrentState(): Promise<void> {
    return;
  }

  async publishDraft(): Promise<boolean> {
    return false;
  }

  async loadPublishedVariantState(): Promise<MapState | null> {
    return null;
  }

  async publishDraftVariant(): Promise<boolean> {
    return false;
  }

  async listPublishedVariants(): Promise<never[]> {
    return [];
  }

  async createRevision() {
    return {
      id: 'rev-1',
      mapId: 'default',
      stage: 'published' as const,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      note: undefined,
      eventType: undefined,
    };
  }

  async listRevisions() {
    return [];
  }

  async loadRevision() {
    return null;
  }
}

describe('MapViewFacade', () => {
  let facade: MapViewFacade;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MapViewFacade,
        {
          provide: MAP_DATA_REPOSITORY,
          useValue: new MapViewLegacyRepositoryStub(),
        },
      ],
    });

    facade = TestBed.inject(MapViewFacade);
  });

  it('normalizes legacy published states that do not include noTrapGeneral', async () => {
    await facade.reloadPublishedState();

    expect(Array.isArray(facade.state().players.noTrapGeneral)).toBeTrue();
    expect(facade.state().players.noTrapGeneral.length).toBe(0);
  });
});

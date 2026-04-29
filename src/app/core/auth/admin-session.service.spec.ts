import { TestBed } from '@angular/core/testing';

import { MAP_DATA_REPOSITORY } from '../state/data/map-data.tokens';
import { MapDataRepository } from '../state/data/map-data.repository';
import { AdminSessionService } from './admin-session.service';

class AdminSessionRepositoryStub implements MapDataRepository {
  async loadAppSetting() {
    return null;
  }

  async saveAppSetting(): Promise<void> {
    return;
  }

  async loadCurrentState() {
    return null;
  }

  async loadPublishedVariantState() {
    return null;
  }

  async saveCurrentState(): Promise<void> {
    return;
  }

  async publishDraft(): Promise<boolean> {
    return false;
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

describe('AdminSessionService', () => {
  let service: AdminSessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AdminSessionService,
        {
          provide: MAP_DATA_REPOSITORY,
          useValue: new AdminSessionRepositoryStub() as MapDataRepository,
        },
      ],
    });

    service = TestBed.inject(AdminSessionService);
    window.sessionStorage.clear();
  });

  it('authenticates with fallback password', async () => {
    const ok = await service.login('kingshot-admin');

    expect(ok).toBeTrue();
    expect(service.isAuthenticated()).toBeTrue();
  });

  it('rejects invalid password', async () => {
    const ok = await service.login('wrong-password');

    expect(ok).toBeFalse();
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('locks login after multiple failed attempts', async () => {
    for (let i = 0; i < 5; i += 1) {
      await service.login('wrong-password');
    }

    expect(service.isLocked()).toBeTrue();
    expect(service.getRemainingLockSeconds()).toBeGreaterThan(0);
  });
});

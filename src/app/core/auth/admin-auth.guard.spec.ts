import { TestBed } from '@angular/core/testing';
import { UrlTree, provideRouter } from '@angular/router';

import { MAP_DATA_REPOSITORY } from '../state/data/map-data.tokens';
import { MapDataRepository } from '../state/data/map-data.repository';
import { adminAuthGuard } from './admin-auth.guard';
import { AdminSessionService } from './admin-session.service';

class AdminGuardRepositoryStub implements MapDataRepository {
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

describe('adminAuthGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        AdminSessionService,
        {
          provide: MAP_DATA_REPOSITORY,
          useValue: new AdminGuardRepositoryStub() as MapDataRepository,
        },
      ],
    });

    window.sessionStorage.clear();
  });

  it('redirects to login when not authenticated', () => {
    const result = TestBed.runInInjectionContext(() => adminAuthGuard({} as never, {} as never));

    expect(result instanceof UrlTree).toBeTrue();
    expect((result as UrlTree).toString()).toContain('/admin/login');
  });

  it('allows access when authenticated', async () => {
    const session = TestBed.inject(AdminSessionService);
    await session.login('kingshot-admin');

    const result = TestBed.runInInjectionContext(() => adminAuthGuard({} as never, {} as never));
    expect(result).toBeTrue();
  });
});

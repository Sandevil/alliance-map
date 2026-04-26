import { TestBed } from '@angular/core/testing';
import { UrlTree, provideRouter } from '@angular/router';

import { adminAuthGuard } from './admin-auth.guard';
import { AdminSessionService } from './admin-session.service';

describe('adminAuthGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), AdminSessionService],
    });

    window.sessionStorage.clear();
  });

  it('redirects to login when not authenticated', () => {
    const result = TestBed.runInInjectionContext(() => adminAuthGuard({} as never, {} as never));

    expect(result instanceof UrlTree).toBeTrue();
    expect((result as UrlTree).toString()).toContain('/admin/login');
  });

  it('allows access when authenticated', () => {
    const session = TestBed.inject(AdminSessionService);
    session.login('kingshot-admin');

    const result = TestBed.runInInjectionContext(() => adminAuthGuard({} as never, {} as never));
    expect(result).toBeTrue();
  });
});

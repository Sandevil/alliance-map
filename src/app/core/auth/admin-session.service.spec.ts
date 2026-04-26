import { AdminSessionService } from './admin-session.service';

describe('AdminSessionService', () => {
  let service: AdminSessionService;

  beforeEach(() => {
    service = new AdminSessionService();
    window.sessionStorage.clear();
  });

  it('authenticates with fallback password', () => {
    const ok = service.login('kingshot-admin');

    expect(ok).toBeTrue();
    expect(service.isAuthenticated()).toBeTrue();
  });

  it('rejects invalid password', () => {
    const ok = service.login('wrong-password');

    expect(ok).toBeFalse();
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('locks login after multiple failed attempts', () => {
    for (let i = 0; i < 5; i += 1) {
      service.login('wrong-password');
    }

    expect(service.isLocked()).toBeTrue();
    expect(service.getRemainingLockSeconds()).toBeGreaterThan(0);
  });
});

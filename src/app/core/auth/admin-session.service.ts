import { inject, Injectable } from '@angular/core';
import { MAP_DATA_REPOSITORY } from '../state/data/map-data.tokens';
import { MapDataRepository } from '../state/data/map-data.repository';

@Injectable({ providedIn: 'root' })
export class AdminSessionService {
  private static readonly SESSION_KEY = 'alliance-map.admin.session.v1';
  private static readonly FALLBACK_PASSWORD = 'kingshot-admin';
  private static readonly FAILED_ATTEMPTS_KEY = 'alliance-map.admin.failed-attempts.v1';
  private static readonly LOCK_UNTIL_KEY = 'alliance-map.admin.lock-until.v1';
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCK_DURATION_MS = 60_000;
  private static readonly ADMIN_PASSWORD_SETTING_KEY = 'admin_password';
  private readonly dataRepository = inject(MAP_DATA_REPOSITORY) as MapDataRepository;

  isAuthenticated(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.sessionStorage.getItem(AdminSessionService.SESSION_KEY) === '1';
  }

  async login(password: string): Promise<boolean> {
    if (this.isLocked()) {
      return false;
    }

    const expectedPassword = await this.resolveAdminPassword();
    const isValid = password === expectedPassword;

    if (!isValid || typeof window === 'undefined') {
      this.registerFailedAttempt();
      return false;
    }

    this.resetFailedAttempts();
    window.sessionStorage.setItem(AdminSessionService.SESSION_KEY, '1');
    return true;
  }

  isLocked(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const lockUntil = Number(window.sessionStorage.getItem(AdminSessionService.LOCK_UNTIL_KEY) ?? '0');
    if (!Number.isFinite(lockUntil) || lockUntil <= Date.now()) {
      return false;
    }

    return true;
  }

  getRemainingLockSeconds(): number {
    if (typeof window === 'undefined') {
      return 0;
    }

    const lockUntil = Number(window.sessionStorage.getItem(AdminSessionService.LOCK_UNTIL_KEY) ?? '0');
    const remainingMs = lockUntil - Date.now();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      return 0;
    }

    return Math.ceil(remainingMs / 1000);
  }

  logout(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.removeItem(AdminSessionService.SESSION_KEY);
  }

  private async resolveAdminPassword(): Promise<string> {
    const setting = await this.dataRepository.loadAppSetting(AdminSessionService.ADMIN_PASSWORD_SETTING_KEY);
    const value = setting?.value?.trim();
    if (value) {
      return value;
    }

    return AdminSessionService.FALLBACK_PASSWORD;
  }

  private registerFailedAttempt(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const current = Number(window.sessionStorage.getItem(AdminSessionService.FAILED_ATTEMPTS_KEY) ?? '0');
    const next = Number.isFinite(current) ? current + 1 : 1;
    window.sessionStorage.setItem(AdminSessionService.FAILED_ATTEMPTS_KEY, `${next}`);

    if (next >= AdminSessionService.MAX_FAILED_ATTEMPTS) {
      const lockUntil = Date.now() + AdminSessionService.LOCK_DURATION_MS;
      window.sessionStorage.setItem(AdminSessionService.LOCK_UNTIL_KEY, `${lockUntil}`);
      window.sessionStorage.setItem(AdminSessionService.FAILED_ATTEMPTS_KEY, '0');
    }
  }

  private resetFailedAttempts(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.removeItem(AdminSessionService.FAILED_ATTEMPTS_KEY);
    window.sessionStorage.removeItem(AdminSessionService.LOCK_UNTIL_KEY);
  }
}

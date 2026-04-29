import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AdminSessionService } from '../../../core/auth/admin-session.service';

@Component({
  selector: 'app-admin-login-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-login-page.component.html',
  styleUrl: './admin-login-page.component.scss',
})
export class AdminLoginPageComponent implements OnDestroy {
  private readonly adminSession = inject(AdminSessionService);
  private readonly router = inject(Router);

  password = '';
  readonly feedback = signal<string | null>(null);
  readonly remainingLockSeconds = signal(0);

  private readonly lockIntervalId = window.setInterval(() => {
    this.remainingLockSeconds.set(this.adminSession.getRemainingLockSeconds());
  }, 1000);

  async login(): Promise<void> {
    if (this.adminSession.isLocked()) {
      this.remainingLockSeconds.set(this.adminSession.getRemainingLockSeconds());
      this.feedback.set(`Too many failed attempts. Try again in ${this.remainingLockSeconds()}s.`);
      return;
    }

    const ok = await this.adminSession.login(this.password);
    if (!ok) {
      this.feedback.set('Invalid password.');
      return;
    }

    this.feedback.set(null);
    void this.router.navigateByUrl('/admin');
  }

  ngOnDestroy(): void {
    window.clearInterval(this.lockIntervalId);
  }
}

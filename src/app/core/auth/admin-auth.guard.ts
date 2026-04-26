import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AdminSessionService } from './admin-session.service';

export const adminAuthGuard: CanActivateFn = () => {
  const session = inject(AdminSessionService);
  const router = inject(Router);

  if (session.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/admin/login']);
};

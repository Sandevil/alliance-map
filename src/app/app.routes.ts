import { Routes } from '@angular/router';
import { MapEditorPageComponent } from './features/map-editor/pages/map-editor-page.component';
import { PublicMapPageComponent } from './features/public/pages/public-map-page.component';
import { AdminLoginPageComponent } from './features/admin/pages/admin-login-page.component';
import { adminAuthGuard } from './core/auth/admin-auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: PublicMapPageComponent,
  },
  {
    path: 'admin/login',
    component: AdminLoginPageComponent,
  },
  {
    path: 'admin',
    component: MapEditorPageComponent,
    canActivate: [adminAuthGuard],
  },
  {
    path: '**',
    redirectTo: '',
  },
];

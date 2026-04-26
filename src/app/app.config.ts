import { ApplicationConfig, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';

import { routes } from './app.routes';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { DATA_MODE, MAP_DATA_REPOSITORY } from './core/state/data/map-data.tokens';
import { resolveDataMode } from './core/state/data/data-mode.config';
import { LocalMapDataRepository } from './core/state/data/local-map-data.repository';
import { CloudMapDataRepository } from './core/state/data/cloud-map-data.repository';

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: DATA_MODE,
      useFactory: resolveDataMode,
    },
    {
      provide: MAP_DATA_REPOSITORY,
      useFactory: (mode: 'local' | 'cloud') => (mode === 'cloud' ? new CloudMapDataRepository() : new LocalMapDataRepository()),
      deps: [DATA_MODE],
    },
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    provideRouter(routes),
    provideTransloco({
      config: {
        availableLangs: ['en'],
        defaultLang: 'en',
        fallbackLang: 'en',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
  ]
};

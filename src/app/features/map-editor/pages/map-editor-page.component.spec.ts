import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { of } from 'rxjs';

import { MapEditorPageComponent } from './map-editor-page.component';
import { MAP_DATA_REPOSITORY } from '../../../core/state/data/map-data.tokens';
import { LocalMapDataRepository } from '../../../core/state/data/local-map-data.repository';

class FakeTranslocoLoader implements TranslocoLoader {
  getTranslation() {
    return of({
      app: {
        title: 'CRU Territory Planner',
        subtitle: 'Plan your oblique grid map and prepare player assignments.',
      },
      mapEditor: {
        placeholder: {
          title: 'Map editor bootstrap ready',
          description: 'placeholder',
        },
      },
    });
  }
}

describe('MapEditorPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapEditorPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: MAP_DATA_REPOSITORY,
          useValue: new LocalMapDataRepository(),
        },
        provideTransloco({
          config: {
            availableLangs: ['en'],
            defaultLang: 'en',
            fallbackLang: 'en',
            reRenderOnLangChange: true,
            prodMode: true,
          },
          loader: FakeTranslocoLoader,
        }),
      ],
    }).compileComponents();
  });

  it('should create component instance', () => {
    const fixture = TestBed.createComponent(MapEditorPageComponent);
    const component = fixture.componentInstance;

    expect(component).toBeTruthy();
  });

  it('should expose tile catalog for sidebar rendering', () => {
    const fixture = TestBed.createComponent(MapEditorPageComponent);
    const component = fixture.componentInstance;

    expect(component.tileCatalog).toContain('city');
    expect(component.tileCatalog.length).toBe(6);
  });

  it('should return human label for tile type', () => {
    const fixture = TestBed.createComponent(MapEditorPageComponent);
    const component = fixture.componentInstance;

    expect(component.getTileLabel('allianceResource')).toBe('Alliance Resource');
  });
});

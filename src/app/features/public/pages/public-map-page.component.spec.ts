import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { MAP_DATA_REPOSITORY } from '../../../core/state/data/map-data.tokens';
import { LocalMapDataRepository } from '../../../core/state/data/local-map-data.repository';
import { PublicMapPageComponent } from './public-map-page.component';

describe('PublicMapPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicMapPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: MAP_DATA_REPOSITORY,
          useValue: new LocalMapDataRepository(),
        },
      ],
    }).compileComponents();
  });

  it('creates component', () => {
    const fixture = TestBed.createComponent(PublicMapPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('returns no city matches for unknown query', () => {
    const fixture = TestBed.createComponent(PublicMapPageComponent);
    const component = fixture.componentInstance;

    component.onQueryChange('unknown-player-fragment');

    expect(component.cityResults().length).toBe(0);
  });

  it('clears search query', () => {
    const fixture = TestBed.createComponent(PublicMapPageComponent);
    const component = fixture.componentInstance;

    component.onQueryChange('abc');
    component.clearSearch();

    expect(component.query()).toBe('');
  });

  it('toggles presentation mode', () => {
    const fixture = TestBed.createComponent(PublicMapPageComponent);
    const component = fixture.componentInstance;

    expect(component.isPresentationMode()).toBeFalse();
    component.togglePresentationMode();
    expect(component.isPresentationMode()).toBeTrue();
  });
});

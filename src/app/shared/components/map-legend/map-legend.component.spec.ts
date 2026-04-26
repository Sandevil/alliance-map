import { TestBed } from '@angular/core/testing';

import { MapLegendComponent } from './map-legend.component';

describe('MapLegendComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapLegendComponent],
    }).compileComponents();
  });

  it('creates component', () => {
    const fixture = TestBed.createComponent(MapLegendComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});

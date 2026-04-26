import { TestBed } from '@angular/core/testing';

import { createInitialMapState } from '../../../core/domain';
import { MapBoardComponent } from './map-board.component';

describe('MapBoardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapBoardComponent],
    }).compileComponents();
  });

  it('creates component', () => {
    const fixture = TestBed.createComponent(MapBoardComponent);
    const component = fixture.componentInstance;
    component.state = createInitialMapState();
    fixture.detectChanges();

    expect(component).toBeTruthy();
  });
});

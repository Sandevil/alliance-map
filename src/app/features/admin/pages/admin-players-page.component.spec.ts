import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TILE_RULES } from '../../../core/domain';
import { MAP_DATA_REPOSITORY } from '../../../core/state/data/map-data.tokens';
import { LocalMapDataRepository } from '../../../core/state/data/local-map-data.repository';
import { MapStateService } from '../../../core/state/map-state.service';
import { AdminPlayersPageComponent } from './admin-players-page.component';

describe('AdminPlayersPageComponent', () => {
  let stateService: MapStateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminPlayersPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: MAP_DATA_REPOSITORY,
          useValue: new LocalMapDataRepository(),
        },
      ],
    }).compileComponents();

    stateService = TestBed.inject(MapStateService);
    stateService.reset();
  });

  it('creates component instance', () => {
    const fixture = TestBed.createComponent(AdminPlayersPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('sorts rows by power asc and desc', () => {
    stateService.addPlayer({ id: 'p-a', name: 'Alpha', power: 300, targetGeneralList: 'trap1General' });
    stateService.addPlayer({ id: 'p-b', name: 'Bravo', power: 100, targetGeneralList: 'trap2General' });
    stateService.addPlayer({ id: 'p-c', name: 'Charlie', power: 200, targetGeneralList: 'noTrapGeneral' });

    const fixture = TestBed.createComponent(AdminPlayersPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.setSort('power');
    expect(component.sortedRows().map((row) => row.power)).toEqual([100, 200, 300]);

    component.setSort('power');
    expect(component.sortedRows().map((row) => row.power)).toEqual([300, 200, 100]);
  });

  it('saves valid rows and keeps failed rows with error feedback', () => {
    for (let index = 0; index < 8; index += 1) {
      const id = `full-${index}`;
      stateService.addPlayer({
        id,
        name: `Full ${index}`,
        power: 10 + index,
        targetGeneralList: 'trap1General',
      });
      stateService.movePlayer(id, 'trap1Main');
    }

    stateService.addPlayer({ id: 'overflow', name: 'Overflow', power: 90, targetGeneralList: 'trap2General' });
    stateService.addPlayer({ id: 'rename', name: 'Rename Me', power: 91, targetGeneralList: 'trap2General' });

    const fixture = TestBed.createComponent(AdminPlayersPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.updateRowCurrentList('overflow', 'trap1Main');
    component.updateRowName('rename', 'Renamed Player');
    component.saveAll();

    expect(component.feedback()).toContain('rows need review');
    expect(component.rows().find((row) => row.id === 'overflow')?.error).toBeTruthy();
    expect(stateService.snapshot.players.trap1Main.some((player) => player.id === 'overflow')).toBeFalse();
    expect(stateService.snapshot.players.trap2General.find((player) => player.id === 'rename')?.name).toBe('Renamed Player');
  });

  it('resets only town placements and keeps players in lists', () => {
    stateService.addPlayer({
      id: 'reset-p',
      name: 'Reset Target',
      power: 123,
      targetGeneralList: 'trap1General',
    });
    stateService.movePlayer('reset-p', 'trap1Main');

    stateService.addPlacement({
      id: 'city-reset',
      type: 'city',
      origin: { x: 4, y: 4 },
      size: TILE_RULES.city.size,
      playerId: 'reset-p',
    });

    stateService.addPlacement({
      id: 'banner-keep',
      type: 'banner',
      origin: { x: 8, y: 8 },
      size: TILE_RULES.banner.size,
    });

    const fixture = TestBed.createComponent(AdminPlayersPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    spyOn(window, 'confirm').and.returnValue(true);
    component.resetPlayerPositionsFromMap();

    expect(stateService.snapshot.placements.some((placement) => placement.id === 'city-reset')).toBeFalse();
    expect(stateService.snapshot.placements.some((placement) => placement.id === 'banner-keep')).toBeTrue();
    expect(stateService.snapshot.players.trap1Main.some((player) => player.id === 'reset-p')).toBeTrue();
  });
});

import { createInitialMapState } from './default-state';
import { validatePlacement } from './placement-rules';
import { TilePlacement } from './models';

function createBanner(id: string, x: number, y: number): TilePlacement {
  return {
    id,
    type: 'banner',
    origin: { x, y },
    size: { w: 1, h: 1 },
  };
}

describe('placement-rules', () => {
  it('validates a correct placement', () => {
    const state = createInitialMapState();
    const placement = createBanner('b1', 2, 3);

    const result = validatePlacement(placement, state);

    expect(result.ok).toBeTrue();
    expect(result.errors.length).toBe(0);
  });

  it('detects out of bounds placement', () => {
    const state = createInitialMapState();
    const placement = createBanner('b1', state.settings.grid.width, 0);

    const result = validatePlacement(placement, state);

    expect(result.ok).toBeFalse();
    expect(result.errors.some((error) => error.code === 'OUT_OF_BOUNDS')).toBeTrue();
  });

  it('detects collision', () => {
    const state = createInitialMapState();
    state.placements = [createBanner('b1', 5, 5)];

    const result = validatePlacement(createBanner('b2', 5, 5), state);

    expect(result.ok).toBeFalse();
    expect(result.errors.some((error) => error.code === 'COLLISION')).toBeTrue();
  });

  it('enforces max limit for fortress', () => {
    const state = createInitialMapState();
    state.placements = [
      {
        id: 'f1',
        type: 'fortress',
        origin: { x: 0, y: 0 },
        size: { w: 3, h: 3 },
      },
    ];

    const result = validatePlacement(
      {
        id: 'f2',
        type: 'fortress',
        origin: { x: 10, y: 10 },
        size: { w: 3, h: 3 },
      },
      state,
    );

    expect(result.ok).toBeFalse();
    expect(result.errors.some((error) => error.code === 'MAX_TILE_LIMIT_REACHED')).toBeTrue();
  });

  it('requires valid playerId for town', () => {
    const state = createInitialMapState();

    const result = validatePlacement(
      {
        id: 'c1',
        type: 'city',
        origin: { x: 4, y: 4 },
        size: { w: 2, h: 2 },
        playerId: 'missing-player',
      },
      state,
    );

    expect(result.ok).toBeFalse();
    expect(result.errors.some((error) => error.code === 'INVALID_CITY_PLAYER')).toBeTrue();
  });
});

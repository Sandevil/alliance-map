import { GRID_MIN_SIZE, TILE_RULES } from './rules.constants';
import { Coord, GridSize, MapState, Player, RuleValidationResult, TilePlacement } from './models';

export function isInsideGrid(placement: TilePlacement, grid: GridSize): boolean {
  const endX = placement.origin.x + placement.size.w - 1;
  const endY = placement.origin.y + placement.size.h - 1;

  return placement.origin.x >= 0 && placement.origin.y >= 0 && endX < grid.width && endY < grid.height;
}

export function getOccupiedCells(placement: TilePlacement): Coord[] {
  const cells: Coord[] = [];

  for (let y = placement.origin.y; y < placement.origin.y + placement.size.h; y += 1) {
    for (let x = placement.origin.x; x < placement.origin.x + placement.size.w; x += 1) {
      cells.push({ x, y });
    }
  }

  return cells;
}

export function hasCollision(placement: TilePlacement, placements: TilePlacement[]): boolean {
  const occupied = new Set(getOccupiedCells(placement).map((cell) => `${cell.x}:${cell.y}`));

  return placements.some((existing) => {
    if (existing.id === placement.id) {
      return false;
    }

    return getOccupiedCells(existing).some((cell) => occupied.has(`${cell.x}:${cell.y}`));
  });
}

export function validateTypeLimits(placement: TilePlacement, placements: TilePlacement[]): RuleValidationResult {
  const rule = TILE_RULES[placement.type];
  if (!rule.maxCount) {
    return okResult();
  }

  const existingCount = placements.filter((item) => item.type === placement.type && item.id !== placement.id).length;
  const isValid = existingCount < rule.maxCount;

  return isValid
    ? okResult()
    : errorResult('MAX_TILE_LIMIT_REACHED', `Tile type ${placement.type} reached max count ${rule.maxCount}.`);
}

export function validateCityPlayer(placement: TilePlacement, players: Player[]): RuleValidationResult {
  if (placement.type !== 'city') {
    return okResult();
  }

  if (!placement.playerId) {
    return errorResult('INVALID_CITY_PLAYER', 'City placement requires playerId.');
  }

  const exists = players.some((player) => player.id === placement.playerId);
  return exists ? okResult() : errorResult('INVALID_CITY_PLAYER', `Unknown playerId: ${placement.playerId}.`);
}

export function validatePlacement(placement: TilePlacement, state: MapState): RuleValidationResult {
  const errors = [] as RuleValidationResult['errors'];

  if (state.settings.grid.width < GRID_MIN_SIZE || state.settings.grid.height < GRID_MIN_SIZE) {
    errors.push({
      code: 'GRID_TOO_SMALL',
      message: `Grid size must be at least ${GRID_MIN_SIZE}x${GRID_MIN_SIZE}.`,
    });
  }

  const expectedSize = TILE_RULES[placement.type].size;
  if (placement.size.w !== expectedSize.w || placement.size.h !== expectedSize.h) {
    errors.push({
      code: 'INVALID_TILE_SIZE',
      message: `Invalid size for ${placement.type}. Expected ${expectedSize.w}x${expectedSize.h}.`,
    });
  }

  if (!isInsideGrid(placement, state.settings.grid)) {
    errors.push({ code: 'OUT_OF_BOUNDS', message: 'Placement is outside the grid.' });
  }

  if (hasCollision(placement, state.placements)) {
    errors.push({ code: 'COLLISION', message: 'Placement collides with existing tile.' });
  }

  const typeLimitResult = validateTypeLimits(placement, state.placements);
  errors.push(...typeLimitResult.errors);

  const allPlayers = getAllPlayers(state);
  const cityResult = validateCityPlayer(placement, allPlayers);
  errors.push(...cityResult.errors);

  return {
    ok: errors.length === 0,
    errors,
  };
}

function getAllPlayers(state: MapState): Player[] {
  return [
    ...state.players.trap1Main,
    ...state.players.trap2Main,
    ...state.players.trap1General,
    ...state.players.trap2General,
  ];
}

function okResult(): RuleValidationResult {
  return { ok: true, errors: [] };
}

function errorResult(code: RuleValidationResult['errors'][number]['code'], message: string): RuleValidationResult {
  return { ok: false, errors: [{ code, message }] };
}

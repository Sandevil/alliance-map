import { GeneralPlayerListKey, Size, TileType } from './models';

export const SCHEMA_VERSION = 1;
export const GRID_MIN_SIZE = 22;
export const GRID_DEFAULT_SIZE = 32;
export const MAIN_LIST_MAX_PLAYERS = 8;

export interface TileRule {
  size: Size;
  maxCount?: number;
}

export const TILE_RULES: Record<TileType, TileRule> = {
  banner: { size: { w: 1, h: 1 } },
  city: { size: { w: 2, h: 2 } },
  allianceResource: { size: { w: 2, h: 2 } },
  bearTrap1: { size: { w: 3, h: 3 }, maxCount: 1 },
  bearTrap2: { size: { w: 3, h: 3 }, maxCount: 1 },
  fortress: { size: { w: 3, h: 3 }, maxCount: 1 },
};

export const GENERAL_LIST_KEYS: readonly GeneralPlayerListKey[] = ['trap1General', 'trap2General'] as const;

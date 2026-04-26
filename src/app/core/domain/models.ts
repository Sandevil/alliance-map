export type TileType = 'banner' | 'city' | 'allianceResource' | 'bearTrap1' | 'bearTrap2' | 'fortress';

export interface Coord {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface GridSize {
  width: number;
  height: number;
}

export type ResizeAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface TilePlacement {
  id: string;
  type: TileType;
  origin: Coord;
  size: Size;
  playerId?: string;
}

export type MainPlayerListKey = 'trap1Main' | 'trap2Main';
export type GeneralPlayerListKey = 'trap1General' | 'trap2General';
export type PlayerListKey = MainPlayerListKey | GeneralPlayerListKey;

export interface Player {
  id: string;
  name: string;
  power: number;
  homeGeneralList: GeneralPlayerListKey;
}

export interface PlayerLists {
  trap1Main: Player[];
  trap2Main: Player[];
  trap1General: Player[];
  trap2General: Player[];
}

export interface ExternalReference {
  anchorInternal: Coord;
  anchorExternal: Coord;
}

export interface MapConfig {
  grid: GridSize;
  externalReference: ExternalReference;
}

export interface MapState {
  schemaVersion: number;
  settings: MapConfig;
  players: PlayerLists;
  placements: TilePlacement[];
}

export type RuleErrorCode =
  | 'OUT_OF_BOUNDS'
  | 'COLLISION'
  | 'MAX_TILE_LIMIT_REACHED'
  | 'INVALID_CITY_PLAYER'
  | 'INVALID_TILE_SIZE'
  | 'GRID_TOO_SMALL'
  | 'PLAYER_ALREADY_EXISTS'
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_LIST_FULL'
  | 'PLAYER_DUPLICATED'
  | 'INVALID_PLAYER_NAME'
  | 'INVALID_PLAYER_POWER'
  | 'INVALID_SCHEMA_VERSION'
  | 'INVALID_MAP_STATE';

export interface RuleValidationError {
  code: RuleErrorCode;
  message: string;
}

export interface RuleValidationResult {
  ok: boolean;
  errors: RuleValidationError[];
}

export interface PlayerInput {
  id: string;
  name: string;
  power: number;
  targetGeneralList: GeneralPlayerListKey;
}

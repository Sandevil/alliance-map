import { GRID_DEFAULT_SIZE, SCHEMA_VERSION } from './rules.constants';
import { MapState } from './models';

export function createInitialMapState(): MapState {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      grid: {
        width: GRID_DEFAULT_SIZE,
        height: GRID_DEFAULT_SIZE,
      },
      externalReference: {
        anchorInternal: { x: 0, y: 0 },
        anchorExternal: { x: 0, y: 0 },
      },
    },
    players: {
      trap1Main: [],
      trap2Main: [],
      trap1General: [],
      trap2General: [],
      noTrapGeneral: [],
    },
    placements: [],
  };
}

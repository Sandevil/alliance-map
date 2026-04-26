import { InjectionToken } from '@angular/core';

import { DataMode } from './map-data.models';
import { MapDataRepository } from './map-data.repository';

export const DATA_MODE = new InjectionToken<DataMode>('DATA_MODE');
export const MAP_DATA_REPOSITORY = new InjectionToken<MapDataRepository>('MAP_DATA_REPOSITORY');

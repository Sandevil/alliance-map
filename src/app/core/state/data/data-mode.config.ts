import { DataMode } from './map-data.models';

const DEFAULT_DATA_MODE: DataMode = 'local';

export function resolveDataMode(): DataMode {
  if (typeof window === 'undefined') {
    return DEFAULT_DATA_MODE;
  }

  const runtimeMode = (window as Window & { __APP_DATA_MODE__?: DataMode }).__APP_DATA_MODE__;
  return runtimeMode === 'cloud' ? 'cloud' : 'local';
}

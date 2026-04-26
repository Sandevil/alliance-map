import { DataMode } from './map-data.models';
import { resolveRuntimeEnv } from '../../config/runtime-env';

const DEFAULT_DATA_MODE: DataMode = 'local';

export function resolveDataMode(): DataMode {
  const runtimeMode = resolveRuntimeEnv().appDataMode;
  return runtimeMode === 'cloud' ? 'cloud' : DEFAULT_DATA_MODE;
}

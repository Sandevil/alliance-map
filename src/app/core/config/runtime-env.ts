import { DataMode } from '../state/data/map-data.models';

type RuntimeWindow = Window & {
  __APP_DATA_MODE__?: DataMode;
  __ALLIANCE_ADMIN_PASSWORD__?: string;
  __SUPABASE_URL__?: string;
  __SUPABASE_ANON_KEY__?: string;
};

export interface RuntimeEnv {
  appDataMode: DataMode;
  adminPassword?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export function resolveRuntimeEnv(): RuntimeEnv {
  if (typeof window === 'undefined') {
    return {
      appDataMode: 'local',
    };
  }

  const runtimeWindow = window as RuntimeWindow;

  const readString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

  return {
    appDataMode: runtimeWindow.__APP_DATA_MODE__ === 'cloud' ? 'cloud' : 'local',
    adminPassword: readString(runtimeWindow.__ALLIANCE_ADMIN_PASSWORD__),
    supabaseUrl: readString(runtimeWindow.__SUPABASE_URL__),
    supabaseAnonKey: readString(runtimeWindow.__SUPABASE_ANON_KEY__),
  };
}

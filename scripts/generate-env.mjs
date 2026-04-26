import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(process.cwd());
const targetPath = resolve(rootDir, 'public', 'env.js');
const localEnvPath = resolve(rootDir, '.env.local');

const parseDotEnv = (raw) => {
  const output = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    output[key] = value;
  }

  return output;
};

const fileEnv = existsSync(localEnvPath) ? parseDotEnv(readFileSync(localEnvPath, 'utf8')) : {};

const readEnv = (key, fallback = '') => {
  const rawValue = process.env[key] ?? fileEnv[key];
  if (typeof rawValue !== 'string') {
    return fallback;
  }

  return rawValue.trim();
};

const values = {
  APP_DATA_MODE: readEnv('APP_DATA_MODE', 'local') === 'cloud' ? 'cloud' : 'local',
  ALLIANCE_ADMIN_PASSWORD: readEnv('ALLIANCE_ADMIN_PASSWORD', ''),
  SUPABASE_URL: readEnv('SUPABASE_URL', ''),
  SUPABASE_ANON_KEY: readEnv('SUPABASE_ANON_KEY', ''),
};

const toJsString = (value) => JSON.stringify(value);

const content = `window.__APP_DATA_MODE__ = ${toJsString(values.APP_DATA_MODE)};
window.__ALLIANCE_ADMIN_PASSWORD__ = ${toJsString(values.ALLIANCE_ADMIN_PASSWORD)};
window.__SUPABASE_URL__ = ${toJsString(values.SUPABASE_URL)};
window.__SUPABASE_ANON_KEY__ = ${toJsString(values.SUPABASE_ANON_KEY)};
`;

writeFileSync(targetPath, content, 'utf8');
console.log(`[prepare:env] Generated ${targetPath}`);
if (existsSync(localEnvPath)) {
  console.log(`[prepare:env] Loaded defaults from ${localEnvPath}`);
}

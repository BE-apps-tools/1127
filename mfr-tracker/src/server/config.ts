export type AiMode = 'anthropic' | 'mock' | 'off';

export interface Config {
  db: 'pg' | 'pglite';
  databaseUrl: string | null;
  storage: 'supabase' | 'local';
  supabaseUrl: string | null;
  supabaseSecretKey: string | null;
  storageBucket: string;
  sessionSecret: string | null;
  anthropicApiKey: string | null;
  anthropicModel: string;
  aiMode: AiMode;
  dataDir: string;
}

type Env = Record<string, string | undefined>;

const blank = (v: string | undefined): string | null => (v && v.trim() !== '' ? v.trim() : null);

/** Reads configuration from an env object (defaults to process.env). Never logs values. */
export function getConfig(env: Env = process.env): Config {
  const databaseUrl = blank(env.DATABASE_URL);
  const supabaseUrl = blank(env.SUPABASE_URL);
  const supabaseSecretKey = blank(env.SUPABASE_SECRET_KEY);
  const apiKey = blank(env.ANTHROPIC_API_KEY);

  if (blank(env.VERCEL) && !databaseUrl) {
    throw new Error(
      'Missing environment variables for the cloud deployment: DATABASE_URL (also set SUPABASE_URL, SUPABASE_SECRET_KEY and SESSION_SECRET).',
    );
  }

  const requested = blank(env.AI_MODE);
  let aiMode: AiMode;
  if (requested === 'anthropic' || requested === 'mock' || requested === 'off') aiMode = requested;
  else aiMode = apiKey ? 'anthropic' : 'off';

  return {
    db: databaseUrl ? 'pg' : 'pglite',
    databaseUrl,
    storage: supabaseUrl && supabaseSecretKey ? 'supabase' : 'local',
    supabaseUrl,
    supabaseSecretKey,
    storageBucket: blank(env.STORAGE_BUCKET) ?? 'mfr-scans',
    sessionSecret: blank(env.SESSION_SECRET),
    anthropicApiKey: apiKey,
    anthropicModel: blank(env.ANTHROPIC_MODEL) ?? 'claude-sonnet-5-5',
    aiMode,
    dataDir: blank(env.DATA_DIR) ?? '.data',
  };
}

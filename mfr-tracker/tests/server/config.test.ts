import { describe, it, expect } from 'vitest';
import { getConfig } from '@/server/config';

describe('getConfig', () => {
  it('no environment gives local adapters', () => {
    const c = getConfig({});
    expect(c.db).toBe('pglite');
    expect(c.storage).toBe('local');
    expect(c.aiMode).toBe('off');
    expect(c.dataDir).toBe('.data');
    expect(c.storageBucket).toBe('mfr-scans');
    expect(c.anthropicModel).toBe('claude-sonnet-5-5');
  });

  it('DATABASE_URL selects pg', () => {
    expect(getConfig({ DATABASE_URL: 'postgres://x' }).db).toBe('pg');
  });

  it('Supabase variables select supabase storage only when both are set', () => {
    expect(getConfig({ SUPABASE_URL: 'https://a.supabase.co' }).storage).toBe('local');
    expect(getConfig({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_SECRET_KEY: 'k' }).storage).toBe('supabase');
  });

  it('VERCEL without DATABASE_URL throws naming DATABASE_URL', () => {
    expect(() => getConfig({ VERCEL: '1' })).toThrow(/DATABASE_URL/);
  });

  it('derives AI_MODE', () => {
    expect(getConfig({ ANTHROPIC_API_KEY: 'k' }).aiMode).toBe('anthropic');
    expect(getConfig({}).aiMode).toBe('off');
    expect(getConfig({ AI_MODE: 'mock' }).aiMode).toBe('mock');
    expect(getConfig({ AI_MODE: 'mock', ANTHROPIC_API_KEY: 'k' }).aiMode).toBe('mock');
    expect(getConfig({ AI_MODE: 'off', ANTHROPIC_API_KEY: 'k' }).aiMode).toBe('off');
    expect(getConfig({ AI_MODE: 'anthropic' }).aiMode).toBe('anthropic');
  });
});

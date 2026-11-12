import { SignJWT, jwtVerify } from 'jose';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getConfig } from '../config';

export const SESSION_COOKIE = 'mfr_session';
export const SESSION_SECONDS = 12 * 60 * 60;

export interface SessionUser {
  id: number;
  role: 'admin' | 'member';
  name: string;
}

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(
  user: SessionUser,
  secret: string,
  opts: { expiresInSeconds?: number } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: user.role, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt(now)
    .setExpirationTime(now + (opts.expiresInSeconds ?? SESSION_SECONDS))
    .sign(key(secret));
}

/** Returns the session user, or null for a bad, forged or expired token. */
export async function verifySession(token: string, secret: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    const id = Number(payload.sub);
    const role = payload.role;
    const name = payload.name;
    if (!Number.isInteger(id) || (role !== 'admin' && role !== 'member') || typeof name !== 'string') return null;
    return { id, role, name };
  } catch {
    return null;
  }
}

let cachedLocalSecret: string | null = null;

/**
 * SESSION_SECRET when set (at least 32 characters). In local mode with none set, a secret is generated once
 * into `${DATA_DIR}/session-secret`. In cloud mode a missing or short secret is an error.
 */
export function getSessionSecret(env: Record<string, string | undefined> = process.env): string {
  const cfg = getConfig(env);
  if (cfg.sessionSecret) {
    if (cfg.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
    return cfg.sessionSecret;
  }
  if (cfg.db === 'pg') throw new Error('SESSION_SECRET is required when DATABASE_URL is set.');
  if (cachedLocalSecret) return cachedLocalSecret;
  const file = path.join(cfg.dataDir, 'session-secret');
  if (fs.existsSync(file)) {
    cachedLocalSecret = fs.readFileSync(file, 'utf8').trim();
  } else {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    cachedLocalSecret = crypto.randomBytes(48).toString('base64url');
    fs.writeFileSync(file, cachedLocalSecret, { mode: 0o600 });
  }
  return cachedLocalSecret;
}

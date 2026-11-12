import { describe, it, expect, beforeAll } from 'vitest';
import type { Db } from '@/server/db/types';
import { freshDb } from '../helpers/db';
import {
  authenticate,
  changePassword,
  createUser,
  listUsers,
  resetPassword,
  updateUser,
} from '@/server/services/users';

const PW = 'correct-horse-1';
let db: Db;

async function mk(email: string, over: Partial<{ role: 'admin' | 'member'; password: string; mustChangePassword: boolean }> = {}) {
  return createUser(db, {
    email,
    fullName: 'Test User',
    initials: 'TU',
    role: over.role ?? 'member',
    password: over.password ?? PW,
    mustChangePassword: over.mustChangePassword ?? false,
  });
}

beforeAll(async () => {
  db = await freshDb();
});

describe('users service', () => {
  it('creates a user and authenticates; email match is case-insensitive', async () => {
    await mk('Ana@Example.com');
    const ok = await authenticate(db, 'ANA@example.COM', PW);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.user.name).toBe('Test User');
      expect(ok.user.role).toBe('member');
      expect(ok.user.mustChangePassword).toBe(false);
    }
    const [row] = await db.query<{ email: string }>(`select email from app_users where email like 'ana%'`);
    expect(row.email).toBe('ana@example.com');
  });

  it('rejects a wrong password and an unknown email as invalid', async () => {
    expect(await authenticate(db, 'ana@example.com', 'wrong-password')).toEqual({ ok: false, reason: 'invalid' });
    expect(await authenticate(db, 'nobody@example.com', PW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('treats an inactive user as invalid', async () => {
    const { id } = await mk('inactive@example.com');
    await mk('keepadmin@example.com', { role: 'admin' });
    await updateUser(db, id, { isActive: false });
    expect(await authenticate(db, 'inactive@example.com', PW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('locks on the eighth consecutive failure and then refuses the correct password', async () => {
    await mk('lock@example.com');
    for (let i = 0; i < 7; i++) {
      expect(await authenticate(db, 'lock@example.com', 'nope-nope-nope')).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(await authenticate(db, 'lock@example.com', 'nope-nope-nope')).toEqual({ ok: false, reason: 'invalid' });
    expect(await authenticate(db, 'lock@example.com', PW)).toEqual({ ok: false, reason: 'locked' });
    const [row] = await db.query<{ failed_logins: number; locked: boolean }>(
      `select failed_logins, (locked_until > now() + interval '14 minutes') as locked from app_users where email = 'lock@example.com'`,
    );
    expect(row.failed_logins).toBe(0);
    expect(row.locked).toBe(true);
  });

  it('resetPassword clears the lock and sets must_change_password', async () => {
    const [u] = await db.query<{ id: number }>(`select id from app_users where email = 'lock@example.com'`);
    await resetPassword(db, u.id, 'brand-new-password');
    const res = await authenticate(db, 'lock@example.com', 'brand-new-password');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.user.mustChangePassword).toBe(true);
  });

  it('a successful login resets the failure counter', async () => {
    await mk('counter@example.com');
    await authenticate(db, 'counter@example.com', 'bad-bad-bad-bad');
    await authenticate(db, 'counter@example.com', 'bad-bad-bad-bad');
    expect((await authenticate(db, 'counter@example.com', PW)).ok).toBe(true);
    const [row] = await db.query<{ failed_logins: number; last_login_at: string | null }>(
      `select failed_logins, last_login_at from app_users where email = 'counter@example.com'`,
    );
    expect(row.failed_logins).toBe(0);
    expect(row.last_login_at).not.toBeNull();
  });

  it('changePassword rejects a wrong current password and a 9-character new one', async () => {
    const { id } = await mk('change@example.com', { mustChangePassword: true });
    await expect(changePassword(db, id, 'not-the-password', 'long-enough-new')).rejects.toThrow(/current password/i);
    await expect(changePassword(db, id, PW, '123456789')).rejects.toThrow(/10 characters/);
    await changePassword(db, id, PW, 'long-enough-new');
    const res = await authenticate(db, 'change@example.com', 'long-enough-new');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.user.mustChangePassword).toBe(false);
  });

  it('createUser enforces the password policy', async () => {
    await expect(mk('short@example.com', { password: 'short' })).rejects.toThrow(/10 characters/);
  });

  it('the last active admin cannot be deactivated or demoted', async () => {
    const d = await freshDb();
    const a = await createUser(d, { email: 'only@example.com', fullName: 'Only', initials: 'O', role: 'admin', password: PW, mustChangePassword: false });
    await expect(updateUser(d, a.id, { isActive: false })).rejects.toThrow(/last active admin/i);
    await expect(updateUser(d, a.id, { role: 'member' })).rejects.toThrow(/last active admin/i);
    const b = await createUser(d, { email: 'second@example.com', fullName: 'Second', initials: 'S', role: 'admin', password: PW, mustChangePassword: false });
    await updateUser(d, a.id, { role: 'member' });
    await expect(updateUser(d, b.id, { isActive: false })).rejects.toThrow(/last active admin/i);
    const users = await listUsers(d);
    expect(users).toHaveLength(2);
    expect(JSON.stringify(users)).not.toContain('password_hash');
    expect(JSON.stringify(users)).not.toContain('passwordHash');
  });
});

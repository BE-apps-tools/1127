import type { Db } from '../db/types';
import { AppError } from '../errors';
import { hashPassword, passwordPolicyError, verifyPassword } from '../auth/password';
import type { SessionUser } from '../auth/session';

export interface NewUser {
  email: string;
  fullName: string;
  initials: string;
  role: 'admin' | 'member';
  password: string;
  mustChangePassword: boolean;
}

export type AuthResult =
  | { ok: true; user: SessionUser & { mustChangePassword: boolean } }
  | { ok: false; reason: 'invalid' | 'locked' };

export interface UserRow {
  id: number;
  email: string;
  fullName: string;
  initials: string;
  role: 'admin' | 'member';
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
}

const LOCK_AFTER = 8;
// A real bcrypt hash of a throwaway string, compared when the email is unknown so timing does not reveal it.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword('not-a-real-password'));

const normEmail = (e: string) => e.trim().toLowerCase();

function requirePolicy(pw: string) {
  const err = passwordPolicyError(pw);
  if (err) throw new AppError('validation', err);
}

export async function createUser(db: Db, u: NewUser): Promise<{ id: number }> {
  requirePolicy(u.password);
  const email = normEmail(u.email);
  if (!email.includes('@')) throw new AppError('validation', 'Enter a valid email address.');
  const taken = await db.query(`select 1 from app_users where email = $1`, [email]);
  if (taken.length) throw new AppError('conflict', 'A user with that email already exists.');
  const hash = await hashPassword(u.password);
  const [row] = await db.query<{ id: number }>(
    `insert into app_users(email, full_name, initials, role, password_hash, must_change_password)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [email, u.fullName.trim(), u.initials.trim(), u.role, hash, u.mustChangePassword],
  );
  return { id: row.id };
}

interface AuthRow {
  id: number;
  full_name: string;
  role: 'admin' | 'member';
  password_hash: string;
  must_change_password: boolean;
  is_active: boolean;
  locked: boolean;
}

export async function authenticate(db: Db, email: string, password: string): Promise<AuthResult> {
  const [u] = await db.query<AuthRow>(
    `select id, full_name, role, password_hash, must_change_password, is_active,
            (locked_until is not null and locked_until > now()) as locked
     from app_users where email = $1`,
    [normEmail(email)],
  );
  if (!u) {
    await verifyPassword(password, await getDummyHash());
    return { ok: false, reason: 'invalid' };
  }
  if (!u.is_active) {
    await verifyPassword(password, u.password_hash);
    return { ok: false, reason: 'invalid' };
  }
  if (u.locked) return { ok: false, reason: 'locked' };

  const good = await verifyPassword(password, u.password_hash);
  if (!good) {
    await db.query(
      `update app_users set
         failed_logins = case when failed_logins + 1 >= $2 then 0 else failed_logins + 1 end,
         locked_until = case when failed_logins + 1 >= $2 then now() + interval '15 minutes' else locked_until end
       where id = $1`,
      [u.id, LOCK_AFTER],
    );
    return { ok: false, reason: 'invalid' };
  }
  await db.query(`update app_users set failed_logins = 0, locked_until = null, last_login_at = now() where id = $1`, [u.id]);
  return { ok: true, user: { id: u.id, role: u.role, name: u.full_name, mustChangePassword: u.must_change_password } };
}

export async function changePassword(db: Db, userId: number, currentPassword: string, newPassword: string): Promise<void> {
  const [u] = await db.query<{ password_hash: string }>(`select password_hash from app_users where id = $1`, [userId]);
  if (!u) throw new AppError('not_found', 'User not found.');
  if (!(await verifyPassword(currentPassword, u.password_hash))) {
    throw new AppError('validation', 'The current password is incorrect.');
  }
  requirePolicy(newPassword);
  const hash = await hashPassword(newPassword);
  await db.query(`update app_users set password_hash = $2, must_change_password = false where id = $1`, [userId, hash]);
}

export async function listUsers(db: Db): Promise<UserRow[]> {
  return db.query<UserRow>(
    `select id, email, full_name as "fullName", initials, role, is_active as "isActive",
            must_change_password as "mustChangePassword", last_login_at as "lastLoginAt", locked_until as "lockedUntil"
     from app_users order by full_name, id`,
  );
}

export async function updateUser(
  db: Db,
  id: number,
  patch: { role?: 'admin' | 'member'; isActive?: boolean; fullName?: string; initials?: string },
): Promise<void> {
  await db.tx(async (tx) => {
    const [u] = await tx.query<{ role: string; is_active: boolean }>(`select role, is_active from app_users where id = $1`, [id]);
    if (!u) throw new AppError('not_found', 'User not found.');
    const losesAdmin = u.role === 'admin' && u.is_active && (patch.role === 'member' || patch.isActive === false);
    if (losesAdmin) {
      const [{ n }] = await tx.query<{ n: number }>(
        `select count(*)::integer as n from app_users where role = 'admin' and is_active and id <> $1`,
        [id],
      );
      if (n === 0) throw new AppError('conflict', 'This is the last active admin. Make another admin first.');
    }
    await tx.query(
      `update app_users set
         role = coalesce($2, role),
         is_active = coalesce($3, is_active),
         full_name = coalesce($4, full_name),
         initials = coalesce($5, initials)
       where id = $1`,
      [id, patch.role ?? null, patch.isActive ?? null, patch.fullName?.trim() ?? null, patch.initials?.trim() ?? null],
    );
  });
}

export async function resetPassword(db: Db, id: number, newPassword: string): Promise<void> {
  requirePolicy(newPassword);
  const hash = await hashPassword(newPassword);
  const rows = await db.query(
    `update app_users set password_hash = $2, must_change_password = true, failed_logins = 0, locked_until = null
     where id = $1 returning id`,
    [id, hash],
  );
  if (!rows.length) throw new AppError('not_found', 'User not found.');
}

/** Fresh role and status for the guard. Null when the user is gone or inactive. */
export async function getUserForSession(
  db: Db,
  id: number,
): Promise<(SessionUser & { mustChangePassword: boolean }) | null> {
  const [u] = await db.query<{ id: number; full_name: string; role: 'admin' | 'member'; must_change_password: boolean }>(
    `select id, full_name, role, must_change_password from app_users where id = $1 and is_active`,
    [id],
  );
  return u ? { id: u.id, role: u.role, name: u.full_name, mustChangePassword: u.must_change_password } : null;
}

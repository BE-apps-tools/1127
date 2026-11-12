import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppError } from '../errors';
import { getDb } from '../container';
import { getUserForSession } from '../services/users';
import { SESSION_COOKIE, SESSION_SECONDS, getSessionSecret, signSession, verifySession, type SessionUser } from './session';

export type GuardedUser = SessionUser & { mustChangePassword: boolean };

/** The signed-in user from the cookie, or null. Does not check the database. */
export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySession(token, getSessionSecret()) : null;
}

/** For server components: a current, active user, else redirect to login or to change-password. */
export async function requirePageUser(opts: { allowPasswordChange?: boolean } = {}): Promise<GuardedUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  const user = await getUserForSession(await getDb(), session.id);
  if (!user) redirect('/login');
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect('/change-password');
  return user;
}

function cookieFromRequest(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** For route handlers. Re-reads is_active and role from the database on every call. */
export async function requireApiUser(req: Request, opts: { allowPasswordChange?: boolean } = {}): Promise<GuardedUser> {
  const token = cookieFromRequest(req, SESSION_COOKIE);
  const session = token ? await verifySession(token, getSessionSecret()) : null;
  if (!session) throw new AppError('unauthorized', 'Sign in required.');
  const user = await getUserForSession(await getDb(), session.id);
  if (!user) throw new AppError('unauthorized', 'Sign in required.');
  if (user.mustChangePassword && !opts.allowPasswordChange) {
    throw new AppError('forbidden', 'Change your password before continuing.');
  }
  return user;
}

export async function requireApiAdmin(req: Request): Promise<GuardedUser> {
  const user = await requireApiUser(req);
  if (user.role !== 'admin') throw new AppError('forbidden', 'Admin access required.');
  return user;
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = await signSession(user, getSessionSecret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
}

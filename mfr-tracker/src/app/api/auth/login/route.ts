import { z } from 'zod';
import { AppError } from '@/server/errors';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { authenticate } from '@/server/services/users';
import { audit } from '@/server/services/audit';
import { setSessionCookie } from '@/server/auth/guard';

export const runtime = 'nodejs';

const Body = z.object({ email: z.string().min(1), password: z.string().min(1) });

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const { email, password } = await readJson(req, Body);
  const db = await getDb();
  const res = await authenticate(db, email, password);
  if (!res.ok) {
    if (res.reason === 'locked') throw new AppError('locked', 'Too many failed attempts. Try again in 15 minutes.');
    throw new AppError('unauthorized', 'Invalid email or password.');
  }
  const { mustChangePassword, ...user } = res.user;
  await setSessionCookie(user);
  await audit(db, { userId: user.id, action: 'user.login', entity: 'user', entityId: user.id });
  return json({ user: { ...user, mustChangePassword } });
});

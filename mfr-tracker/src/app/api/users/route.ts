import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiAdmin } from '@/server/auth/guard';
import { generatePassword } from '@/server/auth/password';
import { createUser, listUsers } from '@/server/services/users';
import { audit } from '@/server/services/audit';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().min(3),
  fullName: z.string().min(1),
  initials: z.string().min(1).max(5),
  role: z.enum(['admin', 'member']),
  password: z.string().optional(),
});

export const GET = handle(async (req) => {
  await requireApiAdmin(req);
  return json(await listUsers(await getDb()));
});

/** Creates a user with a temporary password that must be changed at first sign-in. The password is returned once. */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const admin = await requireApiAdmin(req);
  const body = await readJson(req, Body);
  const password = body.password && body.password.length > 0 ? body.password : generatePassword();
  const db = await getDb();
  const { id } = await createUser(db, { ...body, password, mustChangePassword: true });
  await audit(db, { userId: admin.id, action: 'user.create', entity: 'user', entityId: id, detail: { email: body.email.toLowerCase(), role: body.role } });
  return json({ id, temporaryPassword: password }, 201);
});

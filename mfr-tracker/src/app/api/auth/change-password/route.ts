import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, noContent, readJson } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { changePassword } from '@/server/services/users';
import { audit } from '@/server/services/audit';

export const runtime = 'nodejs';

const Body = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) });

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireApiUser(req, { allowPasswordChange: true });
  const { currentPassword, newPassword } = await readJson(req, Body);
  const db = await getDb();
  await changePassword(db, user.id, currentPassword, newPassword);
  await audit(db, { userId: user.id, action: 'user.update', entity: 'user', entityId: user.id, detail: { passwordChanged: true } });
  return noContent();
});

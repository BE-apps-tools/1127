import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiAdmin } from '@/server/auth/guard';
import { generatePassword } from '@/server/auth/password';
import { idParam } from '@/server/page-upload';
import { resetPassword, updateUser } from '@/server/services/users';
import { audit } from '@/server/services/audit';

export const runtime = 'nodejs';

const Body = z.object({
  fullName: z.string().min(1).optional(),
  initials: z.string().min(1).max(5).optional(),
  role: z.enum(['admin', 'member']).optional(),
  isActive: z.boolean().optional(),
  /** Set this exact temporary password. */
  password: z.string().optional(),
  /** Or ask for a generated temporary password, returned once. */
  resetPassword: z.boolean().optional(),
});

export const PUT = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const admin = await requireApiAdmin(req);
  const id = idParam((await ctx.params).id);
  const { password, resetPassword: wantsReset, ...patch } = await readJson(req, Body);
  const db = await getDb();
  await updateUser(db, id, patch);
  let temporaryPassword: string | undefined;
  if (password || wantsReset) {
    temporaryPassword = password || generatePassword();
    await resetPassword(db, id, temporaryPassword);
  }
  await audit(db, {
    userId: admin.id,
    action: 'user.update',
    entity: 'user',
    entityId: id,
    detail: { fields: Object.keys(patch), passwordReset: !!temporaryPassword },
  });
  return json(temporaryPassword ? { ok: true, temporaryPassword } : { ok: true });
});

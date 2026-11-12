import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiAdmin } from '@/server/auth/guard';
import { idParam } from '@/server/page-upload';
import { updatePerson } from '@/server/services/people';

export const runtime = 'nodejs';

const Body = z
  .object({ fullName: z.string().min(1), isRequester: z.boolean(), isApprover: z.boolean(), isActive: z.boolean() })
  .partial();

export const PUT = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireApiAdmin(req);
  const id = idParam((await ctx.params).id);
  await updatePerson(await getDb(), id, await readJson(req, Body), user.id);
  return json({ ok: true });
});

import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { idParam } from '@/server/page-upload';
import { verifyRequisition } from '@/server/services/requisitions';

export const runtime = 'nodejs';

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(req);
  await verifyRequisition(await getDb(), idParam((await ctx.params).id), user.id);
  return json({ ok: true });
});

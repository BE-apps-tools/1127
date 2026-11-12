import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { idParam } from '@/server/page-upload';
import { reopenPage } from '@/server/services/scans';

export const runtime = 'nodejs';

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(req);
  const pageId = idParam((await ctx.params).id);
  await reopenPage(await getDb(), pageId, user.id);
  return json({ ok: true });
});

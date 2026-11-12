import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiAdmin } from '@/server/auth/guard';
import { idParam } from '@/server/page-upload';
import { voidRequisition } from '@/server/services/requisitions';

export const runtime = 'nodejs';

const Body = z.object({ reason: z.string() });

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireApiAdmin(req);
  const { reason } = await readJson(req, Body);
  await voidRequisition(await getDb(), idParam((await ctx.params).id), user.id, reason);
  return json({ ok: true });
});

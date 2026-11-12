import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { idParam } from '@/server/page-upload';
import { markPageDuplicate } from '@/server/services/scans';

export const runtime = 'nodejs';

const Body = z.object({ requisitionId: z.number().int().positive() });

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(req);
  const pageId = idParam((await ctx.params).id);
  const { requisitionId } = await readJson(req, Body);
  await markPageDuplicate(await getDb(), pageId, requisitionId, user.id);
  return json({ ok: true });
});

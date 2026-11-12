import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiAdmin } from '@/server/auth/guard';
import { idParam } from '@/server/page-upload';
import { mergePart } from '@/server/services/parts';

export const runtime = 'nodejs';

const Body = z.object({ intoId: z.number().int().positive() });

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireApiAdmin(req);
  const fromId = idParam((await ctx.params).id);
  const { intoId } = await readJson(req, Body);
  await mergePart(await getDb(), fromId, intoId, user.id);
  return json({ ok: true });
});

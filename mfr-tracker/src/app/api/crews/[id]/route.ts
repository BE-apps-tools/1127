import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiAdmin } from '@/server/auth/guard';
import { idParam } from '@/server/page-upload';
import { updateCrew } from '@/server/services/crews';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1),
  defaultRequesterId: z.number().int().positive().nullable(),
  isActive: z.boolean(),
  partIds: z.array(z.number().int().positive()),
});

export const PUT = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireApiAdmin(req);
  const id = idParam((await ctx.params).id);
  await updateCrew(await getDb(), id, await readJson(req, Body), user.id);
  return json({ ok: true });
});

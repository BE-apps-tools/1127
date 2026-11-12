import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiAdmin } from '@/server/auth/guard';
import { idParam } from '@/server/page-upload';
import { updatePart } from '@/server/services/parts';
import { z } from 'zod';

export const runtime = 'nodejs';

const Body = z
  .object({
    partNumber: z.string().min(1),
    descriptionOfficial: z.string().nullable(),
    fieldName: z.string().nullable(),
    uom: z.string(),
    eachPerBox: z.number().int().positive().nullable(),
    eachPerPallet: z.number().int().positive().nullable(),
    needsReview: z.boolean(),
    notes: z.string().nullable(),
    isActive: z.boolean(),
    aliases: z.array(z.string()),
  })
  .partial();

export const PUT = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireApiAdmin(req);
  const id = idParam((await ctx.params).id);
  await updatePart(await getDb(), id, await readJson(req, Body), user.id);
  return json({ ok: true });
});

import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiAdmin, requireApiUser } from '@/server/auth/guard';
import { createPart, listParts } from '@/server/services/parts';

export const runtime = 'nodejs';

const PartBody = z.object({
  partNumber: z.string().min(1),
  descriptionOfficial: z.string().nullable(),
  fieldName: z.string().nullable(),
  uom: z.string().optional(),
  eachPerBox: z.number().int().positive().nullable(),
  eachPerPallet: z.number().int().positive().nullable(),
  needsReview: z.boolean(),
  notes: z.string().nullable(),
  isActive: z.boolean().optional(),
  aliases: z.array(z.string()),
});

export const GET = handle(async (req) => {
  await requireApiUser(req);
  const sp = new URL(req.url).searchParams;
  return json(
    await listParts(await getDb(), {
      q: sp.get('q') ?? undefined,
      review: sp.get('review') === '1',
      includeInactive: sp.get('inactive') === '1',
    }),
  );
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireApiAdmin(req);
  const body = await readJson(req, PartBody);
  return json(await createPart(await getDb(), body, user.id), 201);
});

import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { markLinesIssued } from '@/server/services/requisitions';

export const runtime = 'nodejs';

const Body = z.object({
  lineIds: z.array(z.number().int().positive()).min(1).max(1000),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-02.'),
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireApiUser(req);
  const { lineIds, issuedOn } = await readJson(req, Body);
  return json(await markLinesIssued(await getDb(), lineIds, issuedOn, user.id));
});

import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { createBatch } from '@/server/services/scans';

export const runtime = 'nodejs';

const Body = z.object({ filename: z.string().min(1).max(300), pageCount: z.number().int().min(1).max(300) });

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireApiUser(req);
  const { filename, pageCount } = await readJson(req, Body);
  const batch = await createBatch(await getDb(), { filename, pageCount, userId: user.id });
  return json(batch, 201);
});

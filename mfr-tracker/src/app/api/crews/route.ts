import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiAdmin, requireApiUser } from '@/server/auth/guard';
import { createCrew, listCrews } from '@/server/services/crews';

export const runtime = 'nodejs';

const CrewBody = z.object({
  name: z.string().min(1),
  defaultRequesterId: z.number().int().positive().nullable(),
  isActive: z.boolean(),
  partIds: z.array(z.number().int().positive()),
});

export const GET = handle(async (req) => {
  await requireApiUser(req);
  return json(await listCrews(await getDb()));
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireApiAdmin(req);
  return json(await createCrew(await getDb(), await readJson(req, CrewBody), user.id), 201);
});

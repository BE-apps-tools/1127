import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiAdmin, requireApiUser } from '@/server/auth/guard';
import { createPerson, listPeople } from '@/server/services/people';

export const runtime = 'nodejs';

const Body = z.object({
  fullName: z.string().min(1),
  isRequester: z.boolean(),
  isApprover: z.boolean(),
  isActive: z.boolean(),
});

export const GET = handle(async (req) => {
  await requireApiUser(req);
  return json(await listPeople(await getDb()));
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireApiAdmin(req);
  return json(await createPerson(await getDb(), await readJson(req, Body), user.id), 201);
});

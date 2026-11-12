import { getDb } from '@/server/container';
import { handle, json } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { getLookups } from '@/server/services/lookups';

export const runtime = 'nodejs';

export const GET = handle(async (req) => {
  await requireApiUser(req);
  return json(await getLookups(await getDb()));
});

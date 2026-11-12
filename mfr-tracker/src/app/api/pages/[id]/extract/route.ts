import { getAi, getDb, getStorage } from '@/server/container';
import { assertSameOrigin, handle, json } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { idParam } from '@/server/page-upload';
import { getLookups } from '@/server/services/lookups';
import { extractPage } from '@/server/services/scans';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  await requireApiUser(req);
  const pageId = idParam((await ctx.params).id);
  const db = await getDb();
  const res = await extractPage(db, await getStorage(), await getAi(), pageId, await getLookups(db));
  return json(res);
});

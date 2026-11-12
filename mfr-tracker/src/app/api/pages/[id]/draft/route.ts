import { getDb } from '@/server/container';
import { handle, json } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { idParam } from '@/server/page-upload';
import { getLookups } from '@/server/services/lookups';
import { getDraft } from '@/server/services/scans';

export const runtime = 'nodejs';

export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  await requireApiUser(req);
  const pageId = idParam((await ctx.params).id);
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  return json(await getDraft(db, pageId, await getLookups(db), today));
});

import { AppError } from '@/server/errors';
import { getDb, getStorage } from '@/server/container';
import { assertSameOrigin, handle, json } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { idParam, parsePageUpload } from '@/server/page-upload';
import { addPage } from '@/server/services/scans';

export const runtime = 'nodejs';

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  await requireApiUser(req);
  const batchId = idParam((await ctx.params).id);
  const up = await parsePageUpload(req);
  if (up.pageNumber == null) throw new AppError('validation', 'pageNumber is required.');
  const res = await addPage(await getDb(), await getStorage(), { ...up, batchId, pageNumber: up.pageNumber });
  return json(res, 201);
});

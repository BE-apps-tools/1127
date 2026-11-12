import { AppError } from '@/server/errors';
import { getDb, getStorage } from '@/server/container';
import { assertSameOrigin, handle, json } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { idParam, parsePageUpload } from '@/server/page-upload';
import { getPageImage, replacePageImage } from '@/server/services/scans';

export const runtime = 'nodejs';

export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  await requireApiUser(req);
  const pageId = idParam((await ctx.params).id);
  const variant = new URL(req.url).searchParams.get('variant') === 'detail' ? 'detail' : 'full';
  const img = await getPageImage(await getDb(), await getStorage(), pageId, variant);
  if (!img) throw new AppError('not_found', 'Image not found.');
  return new Response(img.bytes as BodyInit, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' },
  });
});

export const PUT = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  await requireApiUser(req);
  const pageId = idParam((await ctx.params).id);
  const up = await parsePageUpload(req);
  await replacePageImage(await getDb(), await getStorage(), pageId, up);
  return json({ status: 'uploaded' });
});

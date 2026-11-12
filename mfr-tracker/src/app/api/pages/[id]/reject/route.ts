import { z } from 'zod';
import { getDb } from '@/server/container';
import { AppError } from '@/server/errors';
import { assertSameOrigin, handle, json } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { idParam } from '@/server/page-upload';
import { rejectPage } from '@/server/services/scans';

export const runtime = 'nodejs';

const Body = z.object({ reason: z.string().max(500).optional() });

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(req);
  const pageId = idParam((await ctx.params).id);
  const text = await req.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new AppError('malformed', 'The request body is not valid JSON.');
    }
  }
  const { reason } = Body.parse(body);
  await rejectPage(await getDb(), pageId, user.id, reason);
  return json({ ok: true });
});

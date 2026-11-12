import { z } from 'zod';
import { AppError } from '@/server/errors';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { idParam } from '@/server/page-upload';
import { RequisitionInputSchema } from '@/domain/requisition-input';
import { getRequisition, updateRequisition } from '@/server/services/requisitions';

export const runtime = 'nodejs';

const Body = z.object({ input: RequisitionInputSchema });

export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  await requireApiUser(req);
  const detail = await getRequisition(await getDb(), idParam((await ctx.params).id));
  if (!detail) throw new AppError('not_found', 'Requisition not found.');
  return json(detail);
});

export const PUT = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(req);
  const id = idParam((await ctx.params).id);
  const { input } = await readJson(req, Body);
  const res = await updateRequisition(await getDb(), id, input, user.id);
  if (!res.ok) return json({ error: 'This looks like a requisition that is already posted.', duplicates: res.duplicates }, 409);
  return json({ ok: true });
});

import { z } from 'zod';
import { getDb } from '@/server/container';
import { assertSameOrigin, handle, json, readJson } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { RequisitionInputSchema } from '@/domain/requisition-input';
import { saveRequisition } from '@/server/services/requisitions';

export const runtime = 'nodejs';

const Body = z.object({ input: RequisitionInputSchema, scanPageId: z.number().int().positive().optional() });

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireApiUser(req);
  const { input, scanPageId } = await readJson(req, Body);
  const res = await saveRequisition(await getDb(), input, {
    userId: user.id,
    source: scanPageId ? 'scan' : 'manual',
    scanPageId,
  });
  if (!res.ok) return json({ error: 'This looks like a requisition that is already posted.', duplicates: res.duplicates }, 409);
  return json({ id: res.id, reqNumber: res.reqNumber }, 201);
});

import { getDb } from '@/server/container';
import { handle } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { exportFileName, matrixToXlsx } from '@/server/services/export';
import { getMatrix } from '@/server/services/matrix';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = handle(async (req) => {
  await requireApiUser(req);
  const sp = new URL(req.url).searchParams;
  const mode = sp.get('mode') === 'requested' ? 'requested' : 'issued';
  const verifiedOnly = ['1', 'true', 'yes'].includes(sp.get('verifiedOnly') ?? '');
  const matrix = await getMatrix(await getDb(), { mode, verifiedOnly });
  return new Response((await matrixToXlsx(matrix)) as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${exportFileName('matrix', 'xlsx')}"`,
      'Cache-Control': 'no-store',
    },
  });
});

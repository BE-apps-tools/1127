import { getDb } from '@/server/container';
import { AppError } from '@/server/errors';
import { handle } from '@/server/http';
import { requireApiUser } from '@/server/auth/guard';
import { exportFileName, toCsv, toXlsx } from '@/server/services/export';
import { exportTracker, parseTrackerFilters } from '@/server/services/tracker';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = handle(async (req) => {
  await requireApiUser(req);
  const sp = new URL(req.url).searchParams;
  const format = sp.get('format') === 'xlsx' ? 'xlsx' : sp.get('format') === 'csv' ? 'csv' : null;
  if (!format) throw new AppError('validation', 'Choose format=csv or format=xlsx.');
  const rows = await exportTracker(await getDb(), parseTrackerFilters(sp));
  const name = exportFileName('tracker', format);
  const headers = { 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' };
  if (format === 'csv') {
    return new Response(toCsv(rows), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' } });
  }
  return new Response((await toXlsx(rows)) as BodyInit, {
    headers: { ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  });
});

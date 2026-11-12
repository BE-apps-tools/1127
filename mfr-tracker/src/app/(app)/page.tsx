import Link from 'next/link';
import { getDb } from '@/server/container';
import { getDashboard } from '@/server/services/dashboard';
import { Badge } from '@/components/ui/Badge';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { fmtDate, fmtNum } from '@/lib/format';

export const metadata = { title: 'Dashboard - MFR Tracker' };

export default async function DashboardPage() {
  const d = await getDashboard(await getDb());
  const tiles: Array<{ label: string; value: number; href: string; hot?: boolean }> = [
    { label: 'Pages to verify', value: d.pagesToVerify, href: '/inbox?tab=review' },
    { label: 'Failed reads', value: d.pagesFailed, href: '/inbox?tab=failed', hot: d.pagesFailed > 0 },
    { label: 'Backlog to verify', value: d.backlogUnverified, href: '/tracker?verified=no' },
    { label: 'Flagged reads', value: d.flaggedReads, href: '/tracker?review=1&verified=no' },
    { label: 'Lines pending issue', value: d.linesPending, href: '/tracker?issue=pending' },
    { label: 'Parts to confirm', value: d.partsToConfirm, href: '/admin/parts?review=1' },
    { label: 'Lines with no part match', value: d.linesUnresolved, href: '/tracker?unresolved=1' },
    { label: 'Repeat issues', value: d.repeatIssues, href: '/matrix' },
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link href={t.href} className="block rounded border border-stone-300 bg-white p-3 hover:border-blue-700">
              <div className={`text-2xl font-semibold ${t.hot ? 'text-red-700' : ''}`}>{fmtNum(t.value)}</div>
              <div className="text-xs text-stone-600">{t.label}</div>
            </Link>
          </li>
        ))}
      </ul>
      <section aria-labelledby="recent">
        <h2 id="recent" className="mb-2 text-sm font-semibold">
          Recent requisitions
        </h2>
        {d.recent.length === 0 ? (
          <p className="text-sm text-stone-600">
            Nothing posted yet. <Link className="text-blue-700 underline" href="/inbox">Upload a scan</Link> or{' '}
            <Link className="text-blue-700 underline" href="/requisitions/new">enter a requisition by hand</Link>.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Req #</Th>
                <Th>Date</Th>
                <Th>Crew</Th>
                <Th>PB</Th>
                <Th>Requester</Th>
                <Th className="text-right">Lines</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {d.recent.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/requisitions/${r.id}`} className="text-blue-700 underline">
                      {r.reqNumber}
                    </Link>
                  </Td>
                  <Td>{fmtDate(r.requestDate)}</Td>
                  <Td>{r.crewName}</Td>
                  <Td>{r.pbLocation}</Td>
                  <Td>{r.requester ?? ''}</Td>
                  <Td className="text-right">{r.lineCount}</Td>
                  <Td>
                    {r.status === 'void' ? <Badge tone="red">Void</Badge> : r.verified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Unverified</Badge>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

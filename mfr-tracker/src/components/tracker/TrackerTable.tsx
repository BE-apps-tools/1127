'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { CONTROL, Field } from '@/components/ui/Input';
import { Table, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { fmtDate, fmtNum, todayIso } from '@/lib/format';
import type { TrackerRow } from '@/server/services/tracker';

export function TrackerTable({ rows }: { rows: TrackerRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);

  const selectable = rows.filter((r) => r.issueStatus === 'pending' && r.qtyRequested != null && r.status === 'posted');
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.lineId));

  function toggle(id: number, on: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  async function markIssued() {
    setBusy(true);
    try {
      const res = await fetch('/api/lines/mark-issued', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineIds: [...selected], issuedOn: date }),
      });
      const body = (await res.json()) as { updated?: number; skipped?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not mark the lines as issued.');
      toast(`${body.updated} line${body.updated === 1 ? '' : 's'} marked issued${body.skipped ? `, ${body.skipped} skipped` : ''}.`);
      setSelected(new Set());
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not mark the lines as issued.', 'error');
    }
    setBusy(false);
  }

  if (rows.length === 0) {
    return (
      <p className="rounded border border-stone-300 bg-white p-4 text-sm text-stone-600">
        No lines match these filters. <Link href="/tracker" className="text-blue-700 underline">Clear the filters</Link> or widen the date range.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" disabled={selected.size === 0} onClick={() => setOpen(true)}>
          Mark issued ({selected.size})
        </Button>
        <span className="text-xs text-stone-500">Select pending lines to mark them issued in full.</span>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>
              <input
                type="checkbox"
                aria-label="Select all pending lines on this page"
                checked={allSelected}
                disabled={selectable.length === 0}
                onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((r) => r.lineId)) : new Set())}
                className="h-4 w-4 accent-blue-700"
              />
            </Th>
            <Th>Req #</Th>
            <Th>Date</Th>
            <Th>Crew</Th>
            <Th>Requester</Th>
            <Th>PB</Th>
            <Th>Part</Th>
            <Th>As written</Th>
            <Th className="text-right">Requested</Th>
            <Th className="text-right">Issued</Th>
            <Th>Need by</Th>
            <Th>Status</Th>
            <Th>Flags</Th>
            <Th>Verified</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const canSelect = r.issueStatus === 'pending' && r.qtyRequested != null && r.status === 'posted';
            const flagged = r.lineConfidence !== 'high' || r.formConfidence !== 'high';
            return (
              <tr
                key={r.lineId}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a,input,button,label')) return;
                  router.push(`/requisitions/${r.requisitionId}`);
                }}
                className={`cursor-pointer hover:bg-stone-50 ${r.status === 'void' ? 'text-stone-400 line-through' : ''}`}
              >
                <Td>
                  {canSelect ? (
                    <input
                      type="checkbox"
                      aria-label={`Select line ${r.lineNo} of ${r.reqNumber}`}
                      checked={selected.has(r.lineId)}
                      onChange={(e) => toggle(r.lineId, e.target.checked)}
                      className="h-4 w-4 accent-blue-700"
                    />
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap">
                  <Link href={`/requisitions/${r.requisitionId}`} className="text-blue-700 underline">
                    {r.reqNumber}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">{fmtDate(r.requestDate)}</Td>
                <Td className="whitespace-nowrap">{r.crewName}</Td>
                <Td className="whitespace-nowrap">{r.requester ?? ''}</Td>
                <Td>{r.pbLocation}</Td>
                <Td className="whitespace-nowrap" title={r.partName ?? undefined}>
                  {r.partNumber ?? r.partNumberRaw ?? ''}
                  {r.partId == null ? <span className="ml-1"><Badge tone="amber">No match</Badge></span> : null}
                </Td>
                <Td>{r.qtyRaw ?? ''}</Td>
                <Td className="text-right tabular-nums">{fmtNum(r.qtyRequested)}</Td>
                <Td className="text-right tabular-nums">{fmtNum(r.qtyIssued)}</Td>
                <Td className="whitespace-nowrap">{fmtDate(r.dateRequired)}</Td>
                <Td>{r.issueStatus === 'issued' ? <Badge tone="green">Issued</Badge> : <Badge tone="gray">Pending</Badge>}</Td>
                <Td>{flagged ? <Badge tone="amber">Check</Badge> : null}</Td>
                <Td>{r.verified ? <span aria-label="Verified">✓</span> : <span className="sr-only">Not verified</span>}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Dialog open={open} onClose={() => setOpen(false)} title="Mark lines as issued">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void markIssued();
          }}
        >
          <p className="text-sm text-stone-700">
            {selected.size} line{selected.size === 1 ? '' : 's'} will be marked issued for the full requested quantity.
          </p>
          <Field label="Issued on">{(id) => <input id={id} type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={CONTROL} />}</Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy || !date}>
              Mark issued
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

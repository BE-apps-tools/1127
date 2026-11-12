'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { CONTROL, Field, Input } from '@/components/ui/Input';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { fmtNum } from '@/lib/format';
import type { PartRow } from '@/server/services/parts';
import { send } from './api';

interface Draft {
  id: number | null;
  partNumber: string;
  descriptionOfficial: string;
  fieldName: string;
  uom: string;
  eachPerBox: string;
  eachPerPallet: string;
  needsReview: boolean;
  notes: string;
  isActive: boolean;
  aliases: string;
}

const blank: Draft = { id: null, partNumber: '', descriptionOfficial: '', fieldName: '', uom: 'EA', eachPerBox: '', eachPerPallet: '', needsReview: false, notes: '', isActive: true, aliases: '' };

const toDraft = (p: PartRow): Draft => ({
  id: p.id,
  partNumber: p.partNumber,
  descriptionOfficial: p.descriptionOfficial ?? '',
  fieldName: p.fieldName ?? '',
  uom: p.uom,
  eachPerBox: p.eachPerBox == null ? '' : String(p.eachPerBox),
  eachPerPallet: p.eachPerPallet == null ? '' : String(p.eachPerPallet),
  needsReview: p.needsReview,
  notes: p.notes ?? '',
  isActive: p.isActive,
  aliases: p.aliases.join(', '),
});

const num = (s: string) => (s.trim() === '' ? null : Number(s));

export function PartsAdmin({ parts }: { parts: PartRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [merge, setMerge] = useState<PartRow | null>(null);
  const [intoId, setIntoId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, done: string, close: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast(done);
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    }
    setBusy(false);
  }

  function save() {
    if (!edit) return;
    const body = {
      partNumber: edit.partNumber,
      descriptionOfficial: edit.descriptionOfficial.trim() || null,
      fieldName: edit.fieldName.trim() || null,
      uom: edit.uom.trim() || 'EA',
      eachPerBox: num(edit.eachPerBox),
      eachPerPallet: num(edit.eachPerPallet),
      needsReview: edit.needsReview,
      notes: edit.notes.trim() || null,
      isActive: edit.isActive,
      aliases: edit.aliases.split(',').map((a) => a.trim()).filter(Boolean),
    };
    void run(() => (edit.id ? send('PUT', `/api/parts/${edit.id}`, body) : send('POST', '/api/parts', body)), edit.id ? 'Part saved.' : 'Part created.', () => setEdit(null));
  }

  const into = parts.find((p) => p.id === Number(intoId));
  const candidates = merge ? parts.filter((p) => p.isActive && p.id !== merge.id) : [];
  const set = (patch: Partial<Draft>) => setEdit((d) => (d ? { ...d, ...patch } : d));

  return (
    <>
      <div className="mb-2">
        <Button variant="primary" onClick={() => { setError(null); setEdit(blank); }}>
          New part
        </Button>
      </div>
      {parts.length === 0 ? (
        <p className="rounded border border-stone-300 bg-white p-4 text-sm text-stone-600">No parts match. Clear the search or add a part.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Part #</Th>
              <Th>Field name</Th>
              <Th>Official description</Th>
              <Th className="text-right">Each/box</Th>
              <Th className="text-right">Each/pallet</Th>
              <Th>Aliases</Th>
              <Th className="text-right">Lines</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <Tr key={p.id} className={p.isActive ? '' : 'text-stone-400'}>
                <Td className="whitespace-nowrap font-medium">{p.partNumber}</Td>
                <Td>{p.fieldName}</Td>
                <Td className="max-w-80 truncate" title={p.descriptionOfficial ?? undefined}>{p.descriptionOfficial}</Td>
                <Td className="text-right">{fmtNum(p.eachPerBox)}</Td>
                <Td className="text-right">{fmtNum(p.eachPerPallet)}</Td>
                <Td>{p.aliases.join(', ')}</Td>
                <Td className="text-right">{p.lineCount}</Td>
                <Td>
                  {!p.isActive ? <Badge tone="gray">Merged</Badge> : p.needsReview ? <Badge tone="amber">Confirm</Badge> : <Badge tone="green">OK</Badge>}
                </Td>
                <Td className="whitespace-nowrap">
                  <Button size="sm" onClick={() => { setError(null); setEdit(toDraft(p)); }}>
                    Edit
                  </Button>{' '}
                  {p.isActive ? (
                    <Button size="sm" onClick={() => { setError(null); setIntoId(''); setMerge(p); }}>
                      Merge into
                    </Button>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <Dialog open={edit != null} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.partNumber}` : 'New part'}>
        {edit ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Part number" required value={edit.partNumber} onChange={(e) => set({ partNumber: e.target.value })} />
              <Input label="Unit of measure" value={edit.uom} onChange={(e) => set({ uom: e.target.value })} />
              <Input label="Field name" value={edit.fieldName} onChange={(e) => set({ fieldName: e.target.value })} />
              <Input label="Official description" value={edit.descriptionOfficial} onChange={(e) => set({ descriptionOfficial: e.target.value })} />
              <Input label="Each per box" inputMode="numeric" value={edit.eachPerBox} onChange={(e) => set({ eachPerBox: e.target.value })} />
              <Input label="Each per pallet" inputMode="numeric" value={edit.eachPerPallet} onChange={(e) => set({ eachPerPallet: e.target.value })} />
            </div>
            <Input label="Aliases (comma separated)" hint="Short or alternate numbers that map to this part." value={edit.aliases} onChange={(e) => set({ aliases: e.target.value })} />
            <Input label="Notes" value={edit.notes} onChange={(e) => set({ notes: e.target.value })} />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={edit.needsReview} onChange={(e) => set({ needsReview: e.target.checked })} className="h-4 w-4 accent-blue-700" />
                Needs review
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={edit.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="h-4 w-4 accent-blue-700" />
                Active
              </label>
            </div>
            {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={busy}>
                Save
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>

      <Dialog open={merge != null} onClose={() => setMerge(null)} title={merge ? `Merge ${merge.partNumber} into another part` : 'Merge'}>
        {merge ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!into) return;
              void run(() => send('POST', `/api/parts/${merge.id}/merge`, { intoId: into.id }), `Merged ${merge.partNumber} into ${into.partNumber}.`, () => setMerge(null));
            }}
          >
            <Field label="Merge into">
              {(id) => (
                <select id={id} required value={intoId} onChange={(e) => setIntoId(e.target.value)} className={CONTROL}>
                  <option value="">Choose a part</option>
                  {candidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.partNumber} - {p.fieldName ?? p.descriptionOfficial ?? ''}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {into ? (
              <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
                {`${merge.partNumber} will be retired and ${merge.lineCount} line${merge.lineCount === 1 ? '' : 's'} will move to ${into.partNumber}. ${merge.partNumber} stays as an alias of ${into.partNumber}. This cannot be undone here.`}
              </p>
            ) : null}
            {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setMerge(null)}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={busy || !into}>
                Merge parts
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}

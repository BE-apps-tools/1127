'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { CONTROL, Field, Input } from '@/components/ui/Input';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import type { CrewRow } from '@/server/services/crews';
import { send } from './api';

interface Draft {
  id: number | null;
  name: string;
  defaultRequesterId: string;
  isActive: boolean;
  partIds: number[];
}

export function CrewsAdmin({
  crews,
  people,
  parts,
}: {
  crews: CrewRow[];
  people: Array<{ id: number; fullName: string }>;
  parts: Array<{ id: number; partNumber: string; label: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [addId, setAddId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const labelOf = (id: number) => {
    const p = parts.find((x) => x.id === id);
    return p ? `${p.partNumber} - ${p.label}` : `Part ${id}`;
  };
  const move = (i: number, d: -1 | 1) =>
    setEdit((e) => {
      if (!e) return e;
      const j = i + d;
      if (j < 0 || j >= e.partIds.length) return e;
      const ids = [...e.partIds];
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return { ...e, partIds: ids };
    });

  async function save() {
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      const body = { name: edit.name, defaultRequesterId: edit.defaultRequesterId ? Number(edit.defaultRequesterId) : null, isActive: edit.isActive, partIds: edit.partIds };
      if (edit.id) await send('PUT', `/api/crews/${edit.id}`, body);
      else await send('POST', '/api/crews', body);
      toast('Crew saved.');
      setEdit(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    }
    setBusy(false);
  }

  return (
    <>
      <div className="mb-2">
        <Button variant="primary" onClick={() => { setError(null); setEdit({ id: null, name: '', defaultRequesterId: '', isActive: true, partIds: [] }); }}>
          New crew
        </Button>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Crew</Th>
            <Th>Code</Th>
            <Th>Default requester</Th>
            <Th>Pre-printed parts</Th>
            <Th>Status</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {crews.map((c) => (
            <Tr key={c.id}>
              <Td className="font-medium">{c.name}</Td>
              <Td className="text-xs text-stone-600">{c.code}</Td>
              <Td>{people.find((p) => p.id === c.defaultRequesterId)?.fullName ?? ''}</Td>
              <Td className="text-xs">{c.parts.map((p) => p.partNumber).join(', ')}</Td>
              <Td>{c.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}</Td>
              <Td>
                <Button
                  size="sm"
                  onClick={() => { setError(null); setEdit({ id: c.id, name: c.name, defaultRequesterId: c.defaultRequesterId ? String(c.defaultRequesterId) : '', isActive: c.isActive, partIds: c.parts.map((p) => p.partId) }); }}
                >
                  Edit
                </Button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <Dialog open={edit != null} onClose={() => setEdit(null)} title={edit?.id ? 'Edit crew' : 'New crew'}>
        {edit ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <Input label="Name" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <Field label="Default requester">
              {(id) => (
                <select id={id} value={edit.defaultRequesterId} onChange={(e) => setEdit({ ...edit, defaultRequesterId: e.target.value })} className={CONTROL}>
                  <option value="">None</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} className="h-4 w-4 accent-blue-700" />
              Active
            </label>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-stone-700">Pre-printed parts, in form order</legend>
              {edit.partIds.length === 0 ? <p className="text-sm text-stone-600">No parts yet. Add one below.</p> : null}
              <ol className="space-y-1">
                {edit.partIds.map((pid, i) => (
                  <li key={pid} className="flex items-center gap-2 rounded border border-stone-200 px-2 py-1 text-sm">
                    <span className="min-w-0 flex-1 truncate">{labelOf(pid)}</span>
                    <Button size="sm" aria-label={`Move ${labelOf(pid)} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                      Up
                    </Button>
                    <Button size="sm" aria-label={`Move ${labelOf(pid)} down`} disabled={i === edit.partIds.length - 1} onClick={() => move(i, 1)}>
                      Down
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Remove ${labelOf(pid)}`} onClick={() => setEdit({ ...edit, partIds: edit.partIds.filter((x) => x !== pid) })}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label="Add a part">
                    {(id) => (
                      <select id={id} value={addId} onChange={(e) => setAddId(e.target.value)} className={CONTROL}>
                        <option value="">Choose a part</option>
                        {parts.filter((p) => !edit.partIds.includes(p.id)).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.partNumber} - {p.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                </div>
                <Button
                  disabled={!addId}
                  onClick={() => {
                    setEdit({ ...edit, partIds: [...edit.partIds, Number(addId)] });
                    setAddId('');
                  }}
                >
                  Add
                </Button>
              </div>
            </fieldset>
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
    </>
  );
}

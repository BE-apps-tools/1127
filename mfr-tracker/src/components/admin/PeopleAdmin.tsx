'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import type { PersonRow } from '@/server/services/people';
import { send } from './api';

interface Draft {
  id: number | null;
  fullName: string;
  isRequester: boolean;
  isApprover: boolean;
  isActive: boolean;
}

export function PeopleAdmin({ people }: { people: PersonRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      const body = { fullName: edit.fullName, isRequester: edit.isRequester, isApprover: edit.isApprover, isActive: edit.isActive };
      if (edit.id) await send('PUT', `/api/people/${edit.id}`, body);
      else await send('POST', '/api/people', body);
      toast('Person saved.');
      setEdit(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    }
    setBusy(false);
  }

  const check = (label: string, key: 'isRequester' | 'isApprover' | 'isActive') => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={edit?.[key] ?? false} onChange={(e) => edit && setEdit({ ...edit, [key]: e.target.checked })} className="h-4 w-4 accent-blue-700" />
      {label}
    </label>
  );

  return (
    <>
      <div className="mb-2">
        <Button variant="primary" onClick={() => { setError(null); setEdit({ id: null, fullName: '', isRequester: true, isApprover: false, isActive: true }); }}>
          New person
        </Button>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Requester</Th>
            <Th>Approver</Th>
            <Th>Status</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <Tr key={p.id} className={p.isActive ? '' : 'text-stone-400'}>
              <Td className="font-medium">{p.fullName}</Td>
              <Td>{p.isRequester ? 'Yes' : ''}</Td>
              <Td>{p.isApprover ? 'Yes' : ''}</Td>
              <Td>{p.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}</Td>
              <Td>
                <Button size="sm" onClick={() => { setError(null); setEdit({ ...p }); }}>
                  Edit
                </Button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <Dialog open={edit != null} onClose={() => setEdit(null)} title={edit?.id ? 'Edit person' : 'New person'}>
        {edit ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <Input label="Full name" required value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} />
            <div className="flex gap-4">
              {check('Requester (foreman)', 'isRequester')}
              {check('Approver', 'isApprover')}
              {check('Active', 'isActive')}
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
    </>
  );
}

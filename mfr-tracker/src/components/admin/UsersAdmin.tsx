'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { CONTROL, Field, Input } from '@/components/ui/Input';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import type { UserRow } from '@/server/services/users';
import { send } from './api';

interface Draft {
  id: number | null;
  email: string;
  fullName: string;
  initials: string;
  role: 'admin' | 'member';
  isActive: boolean;
}

export function UsersAdmin({ users, currentUserId }: { users: UserRow[]; currentUserId: number }) {
  const router = useRouter();
  const toast = useToast();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      if (edit.id) {
        await send('PUT', `/api/users/${edit.id}`, { fullName: edit.fullName, initials: edit.initials, role: edit.role, isActive: edit.isActive });
        toast('User saved.');
      } else {
        const res = await send<{ temporaryPassword: string }>('POST', '/api/users', { email: edit.email, fullName: edit.fullName, initials: edit.initials, role: edit.role });
        setShown({ email: edit.email.toLowerCase(), password: res.temporaryPassword });
      }
      setEdit(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    }
    setBusy(false);
  }

  async function reset(u: UserRow) {
    if (!window.confirm(`Reset the password for ${u.fullName}? They will have to choose a new one at next sign-in.`)) return;
    try {
      const res = await send<{ temporaryPassword: string }>('PUT', `/api/users/${u.id}`, { resetPassword: true });
      setShown({ email: u.email, password: res.temporaryPassword });
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That did not work.', 'error');
    }
  }

  return (
    <>
      <div className="mb-2">
        <Button variant="primary" onClick={() => { setError(null); setEdit({ id: null, email: '', fullName: '', initials: '', role: 'member', isActive: true }); }}>
          New user
        </Button>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Initials</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th>Last sign-in</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <Tr key={u.id} className={u.isActive ? '' : 'text-stone-400'}>
              <Td className="font-medium">
                {u.fullName}
                {u.id === currentUserId ? <span className="ml-1 text-xs text-stone-500">(you)</span> : null}
              </Td>
              <Td>{u.email}</Td>
              <Td>{u.initials}</Td>
              <Td>{u.role === 'admin' ? <Badge tone="blue">Admin</Badge> : 'Member'}</Td>
              <Td>
                {!u.isActive ? <Badge tone="gray">Inactive</Badge> : u.lockedUntil && new Date(u.lockedUntil) > new Date() ? <Badge tone="red">Locked</Badge> : u.mustChangePassword ? <Badge tone="amber">Password change due</Badge> : <Badge tone="green">Active</Badge>}
              </Td>
              <Td className="whitespace-nowrap text-xs">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-US') : 'Never'}</Td>
              <Td className="whitespace-nowrap">
                <Button size="sm" onClick={() => { setError(null); setEdit({ id: u.id, email: u.email, fullName: u.fullName, initials: u.initials, role: u.role, isActive: u.isActive }); }}>
                  Edit
                </Button>{' '}
                <Button size="sm" onClick={() => void reset(u)}>
                  Reset password
                </Button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <Dialog open={edit != null} onClose={() => setEdit(null)} title={edit?.id ? 'Edit user' : 'New user'}>
        {edit ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <Input label="Email" type="email" required disabled={edit.id != null} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            <Input label="Full name" required value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} />
            <Input label="Initials (as on the SIS/IA column)" required maxLength={5} value={edit.initials} onChange={(e) => setEdit({ ...edit, initials: e.target.value })} />
            <Field label="Role">
              {(id) => (
                <select id={id} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as 'admin' | 'member' })} className={CONTROL}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              )}
            </Field>
            {edit.id ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} className="h-4 w-4 accent-blue-700" />
                Active
              </label>
            ) : (
              <p className="text-xs text-stone-600">A temporary password is generated and shown once. The user must change it at first sign-in.</p>
            )}
            {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {edit.id ? 'Save' : 'Create user'}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>

      <Dialog open={shown != null} onClose={() => setShown(null)} title="Temporary password">
        {shown ? (
          <div className="space-y-3">
            <p className="text-sm text-stone-700">
              Give this to {shown.email}. It is shown once and cannot be read again. They must choose a new password at first sign-in.
            </p>
            <p className="select-all rounded border border-stone-300 bg-stone-50 p-2 font-mono text-sm">{shown.password}</p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setShown(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

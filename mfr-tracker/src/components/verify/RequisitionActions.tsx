'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { CONTROL, Field } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { postAction } from '@/components/scan/api';

export function RequisitionActions({ requisitionId, verified, isAdmin }: { requisitionId: number; verified: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast(done);
      setVoiding(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'That did not work.';
      setError(msg);
      toast(msg, 'error');
    }
    setBusy(false);
  }

  return (
    <>
      {!verified ? (
        <Button variant="primary" disabled={busy} onClick={() => void run(() => postAction(`/api/requisitions/${requisitionId}/verify`), 'Marked verified.')}>
          Mark verified
        </Button>
      ) : null}
      {isAdmin ? (
        <Button variant="danger" disabled={busy} onClick={() => setVoiding(true)}>
          Void
        </Button>
      ) : null}
      <Dialog open={voiding} onClose={() => setVoiding(false)} title="Void this requisition">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => postAction(`/api/requisitions/${requisitionId}/void`, { reason }), 'Requisition voided.');
          }}
        >
          <p className="text-sm text-stone-700">Void requisitions stay in the history but leave the tracker totals and the matrix. This cannot be undone here.</p>
          <Field label="Reason" error={error}>
            {(id) => <textarea id={id} required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={CONTROL} />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setVoiding(false)}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={busy || reason.trim() === ''}>
              Void requisition
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

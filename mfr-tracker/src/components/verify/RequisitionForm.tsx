'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { CONTROL, Field } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import type { Lookups } from '@/domain/normalize';
import type { DuplicateRef } from '@/server/services/requisitions';
import { CheckWarnings } from './CheckWarnings';
import { DuplicateBanner } from './DuplicateBanner';
import { LinesEditor } from './LinesEditor';
import { addLine, emptyForCrew, formErrors, hasTypedQuantities, toInput, warnings, type FormState } from './form-state';

type Mode = 'verify' | 'edit' | 'new';

const AMBER = 'border-amber-500 ring-1 ring-amber-400 bg-amber-50';

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Request failed (${res.status}).`;
}

export function RequisitionForm({
  lookups,
  initial,
  mode,
  scanPageId,
  requisitionId,
  nextPageId,
  initialDuplicates = [],
  highlight,
  disabled = false,
}: {
  lookups: Lookups;
  initial: FormState;
  mode: Mode;
  scanPageId?: number;
  requisitionId?: number;
  nextPageId?: number | null;
  initialDuplicates?: DuplicateRef[];
  /** Highlight reads the AI was unsure about. Off once a person has verified the requisition. */
  highlight: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(initial);
  const [duplicates, setDuplicates] = useState<DuplicateRef[]>(initialDuplicates);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const warns = useMemo(() => warnings(form, lookups), [form, lookups]);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const requesters = lookups.people.filter((p) => p.isRequester && (p.isActive || p.id === form.requesterId));
  const approvers = lookups.people.filter((p) => p.isApprover && (p.isActive || p.id === form.approverId));
  const flagged = (flag: string) => highlight && form.flags.includes(flag);

  function goNext() {
    if (nextPageId) router.push(`/verify/${nextPageId}`);
    else {
      toast('The verify queue is empty.');
      router.push('/inbox');
    }
    router.refresh();
  }

  function changeCrew(value: string) {
    const crew = lookups.crews.find((c) => c.id === Number(value));
    if (!crew) return set({ crewId: null });
    if (form.crewId == null) {
      // Nothing was chosen before, so keep the lines that are already there.
      const requester = lookups.people.find((p) => p.id === crew.defaultRequesterId);
      return setForm((f) => ({
        ...f,
        crewId: crew.id,
        requesterId: f.requesterId ?? requester?.id ?? null,
        requesterNameRaw: f.requesterNameRaw ?? requester?.fullName ?? null,
        lines: f.lines.length ? f.lines : emptyForCrew(crew, lookups).lines,
      }));
    }
    if (hasTypedQuantities(form) && !window.confirm('Changing the crew replaces the part rows and clears the quantities you typed. Continue?')) return;
    const fresh = emptyForCrew(crew, lookups);
    setForm((f) => ({ ...fresh, pbLocationRaw: f.pbLocationRaw, requestDate: f.requestDate, notes: f.notes, approverId: f.approverId, approvalSignaturePresent: f.approvalSignaturePresent }));
  }

  async function submit(ack: boolean) {
    const problems = formErrors(form);
    setErrors(problems);
    if (problems.length) return;
    setBusy(true);
    try {
      const input = toInput(form, ack);
      const res =
        mode === 'edit'
          ? await fetch(`/api/requisitions/${requisitionId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }) })
          : await fetch('/api/requisitions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input, scanPageId }) });
      if (res.status === 409) {
        const body = (await res.json()) as { duplicates?: DuplicateRef[]; error?: string };
        if (body.duplicates?.length) setDuplicates(body.duplicates);
        else setErrors([body.error ?? 'That could not be saved.']);
      } else if (!res.ok) {
        setErrors([await readError(res)]);
      } else if (mode === 'edit') {
        setDuplicates([]);
        toast('Saved.');
        router.refresh();
      } else {
        const body = (await res.json()) as { id: number; reqNumber: string };
        toast(`Posted ${body.reqNumber}.`);
        if (mode === 'verify') goNext();
        else router.push(`/requisitions/${body.id}`);
      }
    } catch {
      setErrors(['Could not reach the server. Try again.']);
    }
    setBusy(false);
  }

  async function pageAction(path: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      if (!res.ok) setErrors([await readError(res)]);
      else goNext();
    } catch {
      setErrors(['Could not reach the server. Try again.']);
    }
    setBusy(false);
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) void submit(false);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          void submit(false);
        } else if (e.altKey && e.key.toLowerCase() === 'n') {
          e.preventDefault();
          setForm(addLine);
        }
      }}
    >
      {mode === 'verify' ? (
        <div className="flex items-center justify-end gap-2">
          <Button disabled={busy} onClick={goNext}>
            Skip
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void pageAction(`/api/pages/${scanPageId}/reject`)}>
            Reject
          </Button>
        </div>
      ) : null}

      <DuplicateBanner
        duplicates={duplicates}
        busy={busy}
        onPostAnyway={disabled ? undefined : () => void submit(true)}
        onMarkDuplicate={mode === 'verify' ? (id) => void pageAction(`/api/pages/${scanPageId}/duplicate`, { requisitionId: id }) : undefined}
      />

      <fieldset disabled={disabled || busy} className="space-y-3 disabled:opacity-90">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Crew">
            {(id) => (
              <select id={id} value={form.crewId ?? ''} onChange={(e) => changeCrew(e.target.value)} className={`${CONTROL} ${flagged('crew_inferred') || form.crewId == null ? AMBER : ''}`}>
                <option value="">Choose a crew</option>
                {lookups.crews.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Requester">
            {(id) => (
              <select
                id={id}
                value={form.requesterId ?? ''}
                onChange={(e) => {
                  const p = lookups.people.find((x) => x.id === Number(e.target.value));
                  set({ requesterId: p?.id ?? null, requesterNameRaw: p?.fullName ?? null });
                }}
                className={`${CONTROL} ${flagged('requester_missing') || flagged('requester_uncertain') ? AMBER : ''}`}
              >
                <option value="">{form.requesterNameRaw && form.requesterId == null ? `${form.requesterNameRaw} (not in list)` : 'None'}</option>
                {requesters.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="PB location">
            {(id) => <input id={id} value={form.pbLocationRaw} onChange={(e) => set({ pbLocationRaw: e.target.value })} className={`${CONTROL} ${flagged('pb_uncertain') || flagged('pb_text') ? AMBER : ''}`} />}
          </Field>
          <Field label="Request date">
            {(id) => <input id={id} type="date" value={form.requestDate} onChange={(e) => set({ requestDate: e.target.value })} className={`${CONTROL} ${flagged('date_uncertain') || (highlight && form.requestDate === '') ? AMBER : ''}`} />}
          </Field>
          <Field label="Approver">
            {(id) => (
              <select id={id} value={form.approverId ?? ''} onChange={(e) => set({ approverId: e.target.value ? Number(e.target.value) : null })} className={CONTROL}>
                <option value="">None</option>
                {approvers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="flex items-end gap-2 pb-1.5">
            <input id="signed" type="checkbox" checked={form.approvalSignaturePresent === true} onChange={(e) => set({ approvalSignaturePresent: e.target.checked })} className="h-4 w-4 accent-blue-700" />
            <label htmlFor="signed" className="text-sm">
              Signed
            </label>
          </div>
        </div>
        <Field label="Notes">{(id) => <input id={id} value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={CONTROL} />}</Field>

        <LinesEditor state={form} lookups={lookups} onChange={setForm} highlight={highlight} disabled={disabled || busy} />
      </fieldset>

      <CheckWarnings warnings={warns} />

      {errors.length ? (
        <ul role="alert" className="space-y-0.5 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      {!disabled ? (
        <div className="flex justify-end gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {mode === 'edit' ? 'Save changes' : 'Post'} (Ctrl+Enter)
          </Button>
        </div>
      ) : null}
    </form>
  );
}

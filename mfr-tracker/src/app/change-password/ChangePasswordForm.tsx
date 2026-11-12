'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = String(form.get('newPassword') ?? '');
    if (next !== String(form.get('confirm') ?? '')) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: form.get('currentPassword'), newPassword: next }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Could not change the password.');
    } catch {
      setError('Could not reach the server. Try again.');
    }
    setBusy(false);
  }

  const input = 'w-full rounded border border-gray-300 px-3 py-2 text-sm';
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium">
          Current password
        </label>
        <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required className={input} />
      </div>
      <div>
        <label htmlFor="newPassword" className="mb-1 block text-sm font-medium">
          New password (10 characters minimum)
        </label>
        <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={10} className={input} />
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium">
          Confirm new password
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={input} />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
        {busy ? 'Saving...' : 'Change password'}
      </button>
    </form>
  );
}

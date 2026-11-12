'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      if (res.ok) {
        const { user } = (await res.json()) as { user: { mustChangePassword: boolean } };
        router.push(user.mustChangePassword ? '/change-password' : '/');
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Sign in failed.');
    } catch {
      setError('Could not reach the server. Try again.');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}

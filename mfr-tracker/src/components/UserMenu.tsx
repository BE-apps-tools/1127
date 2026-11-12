'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function UserMenu({ name }: { name: string }) {
  const router = useRouter();
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded px-2 py-1 text-sm text-stone-100 hover:bg-stone-700">{name} ▾</summary>
      <div className="absolute right-0 z-40 mt-1 w-44 rounded border border-stone-300 bg-white py-1 text-stone-900 shadow">
        <Link href="/change-password" className="block px-3 py-1.5 text-sm hover:bg-stone-100">
          Change password
        </Link>
        <button type="button" onClick={signOut} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-stone-100">
          Sign out
        </button>
      </div>
    </details>
  );
}

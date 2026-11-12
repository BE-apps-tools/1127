import { getDb } from '@/server/container';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in - MFR Tracker' };

export default async function LoginPage() {
  const db = await getDb();
  const [{ n }] = await db.query<{ n: number }>(`select count(*)::integer as n from app_users`);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-xl font-semibold">MFR Tracker</h1>
      {n === 0 ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          No users yet. Run <code>npm run seed</code>.
        </p>
      ) : (
        <LoginForm />
      )}
    </main>
  );
}

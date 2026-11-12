import { requirePageUser } from '@/server/auth/guard';
import { ChangePasswordForm } from './ChangePasswordForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Change password - MFR Tracker' };

export default async function ChangePasswordPage() {
  const user = await requirePageUser({ allowPasswordChange: true });
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-2 text-xl font-semibold">Change password</h1>
      {user.mustChangePassword ? <p className="mb-4 text-sm text-gray-600">You must choose a new password before continuing.</p> : null}
      <ChangePasswordForm />
    </main>
  );
}

import Link from 'next/link';

export function Forbidden() {
  return (
    <div className="mx-auto max-w-md space-y-2 rounded border border-stone-300 bg-white p-4">
      <h1 className="text-lg font-semibold">Admin access required</h1>
      <p className="text-sm text-stone-700">Your account is a member account. Ask an admin to change this setting.</p>
      <Link href="/" className="text-sm text-blue-700 underline">
        Back to the dashboard
      </Link>
    </div>
  );
}

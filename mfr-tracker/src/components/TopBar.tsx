import Link from 'next/link';
import { UserMenu } from './UserMenu';

const LINK = 'rounded px-2 py-1 text-sm text-stone-100 hover:bg-stone-700';

export function TopBar({ userName, isAdmin, inboxCount }: { userName: string; isAdmin: boolean; inboxCount: number }) {
  return (
    <header className="bg-stone-900 text-stone-100">
      <nav aria-label="Main" className="mx-auto flex max-w-[1600px] items-center gap-1 px-4 py-2">
        <Link href="/" className="mr-3 text-sm font-semibold text-white">
          MFR Tracker
        </Link>
        <Link href="/" className={LINK}>
          Dashboard
        </Link>
        <Link href="/inbox" className={LINK}>
          Inbox ({inboxCount})
        </Link>
        <Link href="/tracker" className={LINK}>
          Tracker
        </Link>
        <Link href="/matrix" className={LINK}>
          Matrix
        </Link>
        {isAdmin ? (
          <details className="relative">
            <summary className={`${LINK} cursor-pointer list-none`}>Admin ▾</summary>
            <div className="absolute left-0 z-40 mt-1 w-40 rounded border border-stone-300 bg-white py-1 text-stone-900 shadow">
              {[
                ['/admin/parts', 'Parts'],
                ['/admin/crews', 'Crews'],
                ['/admin/people', 'People'],
                ['/admin/users', 'Users'],
              ].map(([href, label]) => (
                <Link key={href} href={href} className="block px-3 py-1.5 text-sm hover:bg-stone-100">
                  {label}
                </Link>
              ))}
            </div>
          </details>
        ) : null}
        <div className="ml-auto">
          <UserMenu name={userName} />
        </div>
      </nav>
    </header>
  );
}

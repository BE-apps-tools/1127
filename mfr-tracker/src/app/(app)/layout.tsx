import { requirePageUser } from '@/server/auth/guard';
import { getDb } from '@/server/container';
import { countPagesByStatus } from '@/server/services/scans';
import { TopBar } from '@/components/TopBar';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const counts = await countPagesByStatus(await getDb());
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-2 focus:py-1">
        Skip to content
      </a>
      <TopBar userName={user.name} isAdmin={user.role === 'admin'} inboxCount={counts.needs_review} />
      <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4">
        {children}
      </main>
    </>
  );
}

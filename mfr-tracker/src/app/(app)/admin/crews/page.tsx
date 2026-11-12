import { requirePageUser } from '@/server/auth/guard';
import { getDb } from '@/server/container';
import { listCrews } from '@/server/services/crews';
import { getLookups } from '@/server/services/lookups';
import { Forbidden } from '@/components/admin/Forbidden';
import { CrewsAdmin } from '@/components/admin/CrewsAdmin';

export const metadata = { title: 'Crews - MFR Tracker' };

export default async function CrewsPage() {
  const user = await requirePageUser();
  if (user.role !== 'admin') return <Forbidden />;
  const db = await getDb();
  const [crews, lookups] = await Promise.all([listCrews(db), getLookups(db)]);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Crews</h1>
      <CrewsAdmin
        crews={crews}
        people={lookups.people.filter((p) => p.isRequester && p.isActive).map((p) => ({ id: p.id, fullName: p.fullName }))}
        parts={lookups.parts.filter((p) => p.isActive).map((p) => ({ id: p.id, partNumber: p.partNumber, label: p.label }))}
      />
    </div>
  );
}

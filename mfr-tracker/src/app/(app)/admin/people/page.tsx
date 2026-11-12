import { requirePageUser } from '@/server/auth/guard';
import { getDb } from '@/server/container';
import { listPeople } from '@/server/services/people';
import { Forbidden } from '@/components/admin/Forbidden';
import { PeopleAdmin } from '@/components/admin/PeopleAdmin';

export const metadata = { title: 'People - MFR Tracker' };

export default async function PeoplePage() {
  const user = await requirePageUser();
  if (user.role !== 'admin') return <Forbidden />;
  const people = await listPeople(await getDb());
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">People</h1>
      <p className="text-sm text-stone-600">These names fill the requester and approver lists on the requisition form.</p>
      <PeopleAdmin people={people} />
    </div>
  );
}

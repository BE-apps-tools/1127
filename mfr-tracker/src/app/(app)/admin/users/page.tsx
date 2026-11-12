import { requirePageUser } from '@/server/auth/guard';
import { getDb } from '@/server/container';
import { listUsers } from '@/server/services/users';
import { Forbidden } from '@/components/admin/Forbidden';
import { UsersAdmin } from '@/components/admin/UsersAdmin';

export const metadata = { title: 'Users - MFR Tracker' };

export default async function UsersPage() {
  const user = await requirePageUser();
  if (user.role !== 'admin') return <Forbidden />;
  const users = await listUsers(await getDb());
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Users</h1>
      <UsersAdmin users={users} currentUserId={user.id} />
    </div>
  );
}

import { loadEnv } from './_env';

loadEnv();

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}

async function main() {
  const email = arg('email');
  const name = arg('name');
  const role = arg('role') ?? 'member';
  if (!email || !name || (role !== 'member' && role !== 'admin')) {
    console.error('Usage: npm run user:create -- --email a@b.c --name "Full Name" --role member|admin [--initials AB]');
    process.exit(1);
  }
  const initials =
    arg('initials') ??
    name
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 3);

  const { getDb } = await import('../src/server/container');
  const { createUser } = await import('../src/server/services/users');
  const { audit } = await import('../src/server/services/audit');
  const { generatePassword } = await import('../src/server/auth/password');

  const db = await getDb();
  const password = generatePassword();
  const { id } = await createUser(db, { email, fullName: name, initials, role, password, mustChangePassword: true });
  await audit(db, { userId: null, action: 'user.create', entity: 'user', entityId: id, detail: { email: email.toLowerCase(), role } });
  console.log(`Created ${role} ${email.toLowerCase()}.`);
  console.log(`Temporary password (shown once, change required at first sign-in): ${password}`);
  await db.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

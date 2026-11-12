import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '@/server/auth/session';

const SECRET_A = 'a'.repeat(40);
const SECRET_B = 'b'.repeat(40);
const user = { id: 7, role: 'admin' as const, name: 'Ruben' };

describe('session tokens', () => {
  it('a signed token verifies and yields the payload', async () => {
    const t = await signSession(user, SECRET_A);
    expect(await verifySession(t, SECRET_A)).toEqual(user);
  });

  it('a token signed with another secret is rejected', async () => {
    const t = await signSession(user, SECRET_B);
    expect(await verifySession(t, SECRET_A)).toBeNull();
  });

  it('an expired token is rejected', async () => {
    const t = await signSession(user, SECRET_A, { expiresInSeconds: -30 });
    expect(await verifySession(t, SECRET_A)).toBeNull();
  });

  it('garbage is rejected', async () => {
    expect(await verifySession('not-a-token', SECRET_A)).toBeNull();
  });
});

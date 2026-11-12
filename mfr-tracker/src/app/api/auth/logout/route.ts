import { assertSameOrigin, handle, noContent } from '@/server/http';
import { clearSessionCookie } from '@/server/auth/guard';

export const runtime = 'nodejs';

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await clearSessionCookie();
  return noContent();
});

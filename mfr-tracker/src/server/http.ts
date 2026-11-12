import { ZodError, type ZodType } from 'zod';
import { AppError, type ErrorCode } from './errors';

const STATUS: Record<ErrorCode, number> = {
  malformed: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation: 422,
  locked: 423,
};

export function json(data: unknown, init?: number | ResponseInit): Response {
  return Response.json(data, typeof init === 'number' ? { status: init } : init);
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** Maps any thrown value to a JSON error response. Unknown errors are logged without request data. */
export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return json({ error: err.message, ...(err.details !== undefined ? { details: err.details } : {}) }, STATUS[err.code]);
  }
  if (err instanceof ZodError) {
    return json(
      {
        error: err.issues[0]?.message ?? 'Invalid input.',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      422,
    );
  }
  console.error('Unhandled error:', err instanceof Error ? err.message : 'unknown');
  return json({ error: 'Something went wrong on the server.' }, 500);
}

/** Wraps a route handler so thrown errors become JSON responses. */
export function handle<Ctx = unknown>(
  fn: (req: Request, ctx: Ctx) => Promise<Response>,
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** When an Origin header is present its host must equal the Host header. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin) return;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    throw new AppError('forbidden', 'Cross-origin request refused.');
  }
  if (host !== req.headers.get('host')) throw new AppError('forbidden', 'Cross-origin request refused.');
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError('malformed', 'The request body is not valid JSON.');
  }
  return schema.parse(body);
}

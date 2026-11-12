export type ErrorCode = 'malformed' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'validation' | 'locked';

/** A failure the caller can act on. `http.ts` maps the code to a status. Never put secrets in the message. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

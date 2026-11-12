export interface Db {
  /** Parameterised query. Placeholders are $1, $2, ... Returns rows. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Multi-statement script with no parameters (migrations). */
  exec(sql: string): Promise<void>;
  /** Runs fn in one transaction. Commit on resolve, rollback on throw. Nested calls are not allowed. */
  tx<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

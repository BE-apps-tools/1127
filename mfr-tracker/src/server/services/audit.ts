import type { Db } from '../db/types';

export interface AuditEntry {
  userId: number | null;
  action: string;
  entity: string;
  entityId: number | null;
  detail?: unknown;
}

export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_log(user_id, action, entity, entity_id, detail) values ($1, $2, $3, $4, $5::jsonb)`,
    [e.userId, e.action, e.entity, e.entityId, e.detail === undefined ? null : JSON.stringify(e.detail)],
  );
}

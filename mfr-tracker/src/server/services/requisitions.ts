import type { Db } from '../db/types';

export interface DuplicateRef {
  id: number;
  reqNumber: string;
  requestDate: string;
  pbLocation: string;
  crewCode: string;
}

/** Posted requisitions that share a fingerprint. `excludeId` leaves one out (the requisition being edited). */
export async function findDuplicates(db: Db, fingerprint: string, excludeId?: number): Promise<DuplicateRef[]> {
  return db.query<DuplicateRef>(
    `select r.id, r.req_number as "reqNumber", r.request_date as "requestDate", r.pb_location as "pbLocation", c.code as "crewCode"
     from requisitions r join crews c on c.id = r.crew_id
     where r.fingerprint = $1 and r.status = 'posted' and ($2::integer is null or r.id <> $2)
     order by r.id`,
    [fingerprint, excludeId ?? null],
  );
}

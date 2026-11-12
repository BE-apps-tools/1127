import type { Db } from '../db/types';

export interface RecentRequisition {
  id: number;
  reqNumber: string;
  requestDate: string;
  crewName: string;
  pbLocation: string;
  requester: string | null;
  lineCount: number;
  verified: boolean;
  status: 'posted' | 'void';
}

export interface Dashboard {
  pagesToVerify: number;
  pagesFailed: number;
  backlogUnverified: number;
  flaggedReads: number;
  linesPending: number;
  partsToConfirm: number;
  linesUnresolved: number;
  repeatIssues: number;
  recent: RecentRequisition[];
}

export async function getDashboard(db: Db): Promise<Dashboard> {
  const [c] = await db.query<Omit<Dashboard, 'recent'>>(
    `select
       (select count(*) from scan_pages where status = 'needs_review')::integer as "pagesToVerify",
       (select count(*) from scan_pages where status = 'failed')::integer as "pagesFailed",
       (select count(*) from requisitions where status = 'posted' and verified_at is null)::integer as "backlogUnverified",
       (select count(*) from requisitions r
         where r.status = 'posted' and r.verified_at is null
           and (r.confidence <> 'high' or exists (select 1 from requisition_lines l where l.requisition_id = r.id and l.confidence <> 'high')))::integer as "flaggedReads",
       (select count(*) from v_tracker_lines where status = 'posted' and issue_status = 'pending')::integer as "linesPending",
       (select count(*) from parts where needs_review and is_active)::integer as "partsToConfirm",
       (select count(*) from v_tracker_lines where status = 'posted' and part_id is null)::integer as "linesUnresolved",
       (select count(*) from v_pb_part_matrix where requisition_count > 1)::integer as "repeatIssues"`,
  );
  const recent = await db.query<RecentRequisition>(
    `select r.id, r.req_number as "reqNumber", r.request_date as "requestDate", c.name as "crewName", r.pb_location as "pbLocation",
            coalesce(p.full_name, r.requester_name_raw) as requester,
            (select count(*) from requisition_lines l where l.requisition_id = r.id)::integer as "lineCount",
            (r.verified_at is not null) as verified, r.status
     from requisitions r join crews c on c.id = r.crew_id left join people p on p.id = r.requester_id
     order by r.id desc limit 10`,
  );
  return { ...c, recent };
}

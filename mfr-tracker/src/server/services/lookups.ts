import type { Db } from '../db/types';
import type { Lookups } from '@/domain/normalize';
import type { CrewCheck } from '@/domain/types';

export async function getLookups(db: Db): Promise<Lookups> {
  const parts = await db.query<Lookups['parts'][number]>(
    `select id, part_number as "partNumber",
            coalesce(field_name, description_official, part_number) as label,
            each_per_box as "eachPerBox", each_per_pallet as "eachPerPallet",
            needs_review as "needsReview", is_active as "isActive"
     from parts order by part_number`,
  );
  const aliases = await db.query<Lookups['aliases'][number]>(`select alias, part_id as "partId" from part_aliases order by alias`);
  const people = await db.query<Lookups['people'][number]>(
    `select id, full_name as "fullName", is_requester as "isRequester", is_approver as "isApprover", is_active as "isActive"
     from people order by full_name`,
  );
  const crewRows = await db.query<{ id: number; code: string; name: string; defaultRequesterId: number | null; checks: CrewCheck[] }>(
    `select id, code, name, default_requester_id as "defaultRequesterId", checks from crews where is_active order by sort_order, id`,
  );
  const crewParts = await db.query<{ crewId: number; partId: number; partNumber: string; label: string }>(
    `select cp.crew_id as "crewId", cp.part_id as "partId", p.part_number as "partNumber",
            coalesce(p.field_name, p.description_official, p.part_number) as label
     from crew_parts cp join parts p on p.id = cp.part_id order by cp.crew_id, cp.sort_order`,
  );
  const crews = crewRows.map((c) => ({
    ...c,
    parts: crewParts.filter((cp) => cp.crewId === c.id).map(({ partId, partNumber, label }) => ({ partId, partNumber, label })),
  }));
  return { crews, parts, aliases, people };
}

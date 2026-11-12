import fs from 'node:fs';
import path from 'node:path';
import type { Lookups } from '@/domain/normalize';

interface MasterJson {
  parts: Array<{ part_number: string; description_official: string | null; field_name: string | null; each_per_box: number | null; each_per_pallet: number | null; needs_review: boolean }>;
  part_aliases: Array<{ alias: string; part_number: string }>;
  people: Array<{ full_name: string }>;
  crews: Array<{ code: string; name: string; default_requester: string | null; parts: string[]; checks: Lookups['crews'][number]['checks'] }>;
}

/** Lookups built from seed/master.json with ids = index + 1, for tests that need no database. */
export function lookupsFromMaster(): Lookups {
  const master = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../seed/master.json'), 'utf8')) as MasterJson;
  const parts = master.parts.map((p, i) => ({
    id: i + 1,
    partNumber: p.part_number,
    label: p.field_name ?? p.description_official ?? p.part_number,
    eachPerBox: p.each_per_box,
    eachPerPallet: p.each_per_pallet,
    needsReview: p.needs_review,
    isActive: true,
  }));
  const idOf = (pn: string) => parts.find((p) => p.partNumber === pn)!.id;
  const people = master.people.map((p, i) => ({ id: i + 1, fullName: p.full_name, isRequester: true, isApprover: false, isActive: true }));
  return {
    parts,
    aliases: master.part_aliases.map((a) => ({ alias: a.alias, partId: idOf(a.part_number) })),
    people,
    crews: master.crews.map((c, i) => ({
      id: i + 1,
      code: c.code,
      name: c.name,
      defaultRequesterId: c.default_requester ? people.find((p) => p.fullName === c.default_requester)!.id : null,
      checks: c.checks,
      parts: c.parts.map((pn) => ({ partId: idOf(pn), partNumber: pn, label: parts.find((p) => p.partNumber === pn)!.label })),
    })),
  };
}

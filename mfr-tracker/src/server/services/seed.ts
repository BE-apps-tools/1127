import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Db } from '../db/types';
import type { Storage } from '../storage/types';
import type { CrewCheck, PackUnit } from '@/domain/types';
import { fingerprint, issuedQty } from '@/domain/rules';
import { createUser } from './users';
import { audit } from './audit';

interface MasterJson {
  parts: Array<{
    part_number: string;
    description_official: string | null;
    field_name: string | null;
    uom: string;
    each_per_box: number | null;
    each_per_pallet: number | null;
    needs_review: boolean;
    notes: string | null;
  }>;
  part_aliases: Array<{ alias: string; part_number: string }>;
  people: Array<{ full_name: string }>;
  crews: Array<{ code: string; name: string; default_requester: string | null; parts: string[]; checks: CrewCheck[] }>;
}

interface SeedLine {
  line_no: number;
  part_number: string | null;
  part_number_raw: string | null;
  description_raw: string | null;
  is_write_in: boolean;
  qty_raw: string | null;
  qty_each: number | null;
  pack_qty: number | null;
  pack_unit: PackUnit | null;
  unit_word: string | null;
  date_required: string | null;
  sis_initialed: boolean;
  confidence: string;
  flags: string[];
  note: string | null;
}

interface SeedForm {
  crew_code: string;
  requester: string | null;
  pb_location_raw: string | null;
  pb_location: string;
  pb_number: number | null;
  request_date: string;
  approval_signature_present: boolean | null;
  notes: string | null;
  confidence: string;
  flags: string[];
}

interface SeedPage {
  page_key: string;
  scan_file: string;
  page_number: number;
  image: string;
  duplicate_of: string | null;
  form: SeedForm | null;
  lines: SeedLine[];
}

export interface SeedAdmin {
  email: string;
  name: string;
  password: string;
  /** Defaults to true. False only for end-to-end tests. */
  mustChangePassword?: boolean;
}

export interface SeedResult {
  seeded: boolean;
  pages: number;
  requisitions: number;
  lines: number;
}

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

async function counts(db: Db): Promise<Omit<SeedResult, 'seeded'>> {
  const [r] = await db.query<{ pages: number; requisitions: number; lines: number }>(
    `select (select count(*) from scan_pages)::integer as pages,
            (select count(*) from requisitions)::integer as requisitions,
            (select count(*) from requisition_lines)::integer as lines`,
  );
  return r;
}

/**
 * Loads master data, the 148 scanned pages and the 140 requisitions of the backlog. See contract section 9.
 * Storage uploads run first and are idempotent; everything else runs in one transaction.
 */
export async function seedDatabase(db: Db, storage: Storage, kitDir: string, admin: SeedAdmin): Promise<SeedResult> {
  const already = await db.query(`select 1 from scan_batches where source = 'seed' limit 1`);
  if (already.length) return { seeded: false, ...(await counts(db)) };

  const master = readJson<MasterJson>(path.join(kitDir, 'seed', 'master.json'));
  const seed = readJson<{ pages: SeedPage[] }>(path.join(kitDir, 'seed', 'seed.json'));

  const shaByKey = new Map<string, string>();
  for (const p of seed.pages) {
    const bytes = fs.readFileSync(path.join(kitDir, 'seed', p.image));
    shaByKey.set(p.page_key, crypto.createHash('sha256').update(bytes).digest('hex'));
    await storage.put(`seed/${p.page_key}.jpg`, new Uint8Array(bytes), 'image/jpeg');
  }

  await db.tx(async (tx) => {
    const partId = new Map<string, number>();
    for (const p of master.parts) {
      const [r] = await tx.query<{ id: number }>(
        `insert into parts(part_number, description_official, field_name, uom, each_per_box, each_per_pallet, needs_review, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [p.part_number.toUpperCase(), p.description_official, p.field_name, p.uom, p.each_per_box, p.each_per_pallet, p.needs_review, p.notes],
      );
      partId.set(p.part_number, r.id);
    }
    for (const a of master.part_aliases) {
      await tx.query(`insert into part_aliases(alias, part_id) values ($1, $2)`, [a.alias.toUpperCase(), partId.get(a.part_number)]);
    }
    const personId = new Map<string, number>();
    for (const p of master.people) {
      const [r] = await tx.query<{ id: number }>(`insert into people(full_name, is_requester) values ($1, true) returning id`, [p.full_name]);
      personId.set(p.full_name, r.id);
    }
    const crewId = new Map<string, number>();
    let order = 0;
    for (const c of master.crews) {
      const [r] = await tx.query<{ id: number }>(
        `insert into crews(code, name, default_requester_id, checks, sort_order) values ($1, $2, $3, $4::jsonb, $5) returning id`,
        [c.code, c.name, c.default_requester ? (personId.get(c.default_requester) ?? null) : null, JSON.stringify(c.checks), order++],
      );
      crewId.set(c.code, r.id);
      let i = 0;
      for (const pn of c.parts) {
        await tx.query(`insert into crew_parts(crew_id, part_id, sort_order) values ($1, $2, $3)`, [r.id, partId.get(pn), i++]);
      }
    }

    const batchId = new Map<string, number>();
    for (const file of [...new Set(seed.pages.map((p) => p.scan_file))]) {
      const [r] = await tx.query<{ id: number }>(
        `insert into scan_batches(filename, page_count, source) values ($1, $2, 'seed') returning id`,
        [file, seed.pages.filter((p) => p.scan_file === file).length],
      );
      batchId.set(file, r.id);
    }

    const pageId = new Map<string, number>();
    for (const p of seed.pages) {
      const [r] = await tx.query<{ id: number }>(
        `insert into scan_pages(batch_id, page_number, page_key, image_path, image_sha256, width, height, rotation_applied,
                                status, extraction, extraction_model, extracted_at)
         values ($1, $2, $3, $4, $5, 1600, 1236, 0, $6, $7::jsonb, 'manual-transcription', now()) returning id`,
        [
          batchId.get(p.scan_file),
          p.page_number,
          p.page_key,
          `seed/${p.page_key}.jpg`,
          shaByKey.get(p.page_key),
          p.duplicate_of ? 'duplicate' : 'posted',
          p.form ? JSON.stringify({ form: p.form, lines: p.lines }) : null,
        ],
      );
      pageId.set(p.page_key, r.id);
    }

    let reqCount = 0;
    for (const p of seed.pages) {
      if (p.duplicate_of || !p.form) continue;
      const f = p.form;
      const [{ n }] = await tx.query<{ n: number }>(`select nextval('req_number_seq')::integer as n`);
      const reqNumber = `MFR-${String(n).padStart(6, '0')}`;
      const fp = fingerprint({
        crewCode: f.crew_code,
        pbLocation: f.pb_location,
        requestDate: f.request_date,
        lines: p.lines.map((l) => ({ partNumber: l.part_number, partNumberRaw: l.part_number_raw, qtyEach: l.qty_each, qtyRaw: l.qty_raw })),
      });
      const [req] = await tx.query<{ id: number }>(
        `insert into requisitions(req_number, status, source, crew_id, requester_id, requester_name_raw, pb_location, pb_location_raw,
                                  pb_number, request_date, approval_signature_present, notes, flags, confidence, fingerprint, scan_page_id)
         values ($1, 'posted', 'seed', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
        [
          reqNumber,
          crewId.get(f.crew_code),
          f.requester ? (personId.get(f.requester) ?? null) : null,
          f.requester,
          f.pb_location,
          f.pb_location_raw,
          f.pb_number,
          f.request_date,
          f.approval_signature_present,
          f.notes,
          f.flags,
          f.confidence,
          fp,
          pageId.get(p.page_key),
        ],
      );
      await tx.query(`update scan_pages set requisition_id = $1 where id = $2`, [req.id, pageId.get(p.page_key)]);
      for (const l of p.lines) {
        await tx.query(
          `insert into requisition_lines(requisition_id, line_no, part_id, part_number_raw, description_raw, is_write_in, qty_raw,
                                         qty_requested, pack_qty, pack_unit, unit_word, date_required, sis_initialed, qty_issued,
                                         confidence, flags, note)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            req.id,
            l.line_no,
            l.part_number ? (partId.get(l.part_number) ?? null) : null,
            l.part_number_raw,
            l.description_raw,
            l.is_write_in,
            l.qty_raw,
            l.qty_each,
            l.pack_qty,
            l.pack_unit,
            l.unit_word,
            l.date_required,
            l.sis_initialed,
            issuedQty(l.sis_initialed, l.qty_each),
            l.confidence,
            l.flags,
            l.note,
          ],
        );
      }
      reqCount++;
    }

    for (const p of seed.pages) {
      if (!p.duplicate_of) continue;
      const original = pageId.get(p.duplicate_of);
      await tx.query(
        `update scan_pages set duplicate_of_page_id = $1,
                requisition_id = (select requisition_id from scan_pages where id = $1)
         where id = $2`,
        [original, pageId.get(p.page_key)],
      );
    }

    const { id: adminId } = await createUser(tx, {
      email: admin.email,
      fullName: admin.name,
      initials: admin.name
        .split(/\s+/)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('')
        .slice(0, 3),
      role: 'admin',
      password: admin.password,
      mustChangePassword: admin.mustChangePassword ?? true,
    });
    await tx.query(`insert into app_settings(key, value) values ('project_label', $1::jsonb)`, [JSON.stringify('Site')]);
    await audit(tx, {
      userId: adminId,
      action: 'seed.run',
      entity: 'seed',
      entityId: null,
      detail: { pages: seed.pages.length, requisitions: reqCount },
    });
  });

  return { seeded: true, ...(await counts(db)) };
}

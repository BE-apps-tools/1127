import type { Db } from '../db/types';
import { AppError } from '../errors';
import { RequisitionInputSchema, type RequisitionInput } from '@/domain/requisition-input';
import { parsePb } from '@/domain/parse';
import { fingerprint, issuedQty } from '@/domain/rules';
import type { Confidence, PackUnit } from '@/domain/types';
import { audit } from './audit';

export interface DuplicateRef {
  id: number;
  reqNumber: string;
  requestDate: string;
  pbLocation: string;
  crewCode: string;
}

export interface RequisitionLineDetail {
  id: number;
  lineNo: number;
  partId: number | null;
  partNumber: string | null;
  partNumberRaw: string | null;
  descriptionRaw: string | null;
  isWriteIn: boolean;
  qtyRaw: string | null;
  qtyRequested: number | null;
  packQty: number | null;
  packUnit: PackUnit | null;
  unitWord: string | null;
  dateRequired: string | null;
  sisInitialed: boolean;
  qtyIssued: number;
  issuedOn: string | null;
  confidence: Confidence;
  flags: string[];
  note: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  action: string;
  userName: string | null;
  detail: unknown;
}

export interface RequisitionDetail {
  id: number;
  reqNumber: string;
  status: 'posted' | 'void';
  source: 'scan' | 'manual' | 'seed';
  crewId: number;
  crewCode: string;
  crewName: string;
  requesterId: number | null;
  requesterNameRaw: string | null;
  pbLocation: string;
  pbLocationRaw: string | null;
  pbNumber: number | null;
  requestDate: string;
  approverId: number | null;
  approvalSignaturePresent: boolean | null;
  notes: string | null;
  flags: string[];
  confidence: Confidence;
  scanPageId: number | null;
  verifiedAt: string | null;
  verifiedBy: number | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
  lines: RequisitionLineDetail[];
  auditEntries: AuditEntry[];
}

export type SaveResult = { ok: true; id: number; reqNumber: string } | { ok: false; duplicates: DuplicateRef[] };
export type UpdateResult = { ok: true } | { ok: false; duplicates: DuplicateRef[] };

/** Posted requisitions that share a fingerprint. `excludeId` leaves one out (the requisition being edited). */
export async function findDuplicates(db: Db, fp: string, excludeId?: number): Promise<DuplicateRef[]> {
  return db.query<DuplicateRef>(
    `select r.id, r.req_number as "reqNumber", r.request_date as "requestDate", r.pb_location as "pbLocation", c.code as "crewCode"
     from requisitions r join crews c on c.id = r.crew_id
     where r.fingerprint = $1 and r.status = 'posted' and ($2::integer is null or r.id <> $2)
     order by r.id`,
    [fp, excludeId ?? null],
  );
}

interface Prepared {
  input: RequisitionInput;
  pbLocation: string;
  pbNumber: number | null;
  fingerprint: string;
}

async function prepare(db: Db, raw: RequisitionInput): Promise<Prepared> {
  const input = RequisitionInputSchema.parse(raw) as RequisitionInput;
  const [crew] = await db.query<{ code: string }>(`select code from crews where id = $1`, [input.crewId]);
  if (!crew) throw new AppError('validation', 'Choose a crew.');
  const partIds = [...new Set(input.lines.map((l) => l.partId).filter((x): x is number => x != null))];
  const parts = partIds.length
    ? await db.query<{ id: number; part_number: string }>(`select id, part_number from parts where id = any($1::integer[])`, [partIds])
    : [];
  for (const id of partIds) if (!parts.some((p) => p.id === id)) throw new AppError('validation', 'A line refers to a part that does not exist.');
  const pb = parsePb(input.pbLocationRaw);
  const fp = fingerprint({
    crewCode: crew.code,
    pbLocation: pb.pbLocation,
    requestDate: input.requestDate,
    lines: input.lines.map((l) => ({
      partNumber: l.partId == null ? null : (parts.find((p) => p.id === l.partId)?.part_number ?? null),
      partNumberRaw: l.partNumberRaw,
      qtyEach: l.qtyRequested,
      qtyRaw: l.qtyRaw,
    })),
  });
  return { input, pbLocation: pb.pbLocation, pbNumber: pb.pbNumber, fingerprint: fp };
}

async function insertLines(db: Db, requisitionId: number, input: RequisitionInput): Promise<void> {
  let n = 0;
  for (const l of input.lines) {
    n++;
    await db.query(
      `insert into requisition_lines(requisition_id, line_no, part_id, part_number_raw, description_raw, is_write_in, qty_raw,
                                     qty_requested, pack_qty, pack_unit, unit_word, date_required, sis_initialed, qty_issued,
                                     confidence, flags, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        requisitionId,
        n,
        l.partId,
        l.partNumberRaw?.trim() || null,
        l.descriptionRaw,
        l.isWriteIn,
        l.qtyRaw,
        l.qtyRequested,
        l.packQty,
        l.packUnit,
        l.unitWord,
        l.dateRequired,
        l.sisInitialed,
        issuedQty(l.sisInitialed, l.qtyRequested),
        l.confidence,
        l.flags,
        l.note,
      ],
    );
  }
}

export async function saveRequisition(
  db: Db,
  rawInput: RequisitionInput,
  ctx: { userId: number; source: 'scan' | 'manual'; scanPageId?: number },
): Promise<SaveResult> {
  return db.tx(async (tx) => {
    const p = await prepare(tx, rawInput);
    const dupes = await findDuplicates(tx, p.fingerprint);
    if (dupes.length && !p.input.duplicateAcknowledged) return { ok: false as const, duplicates: dupes };

    const [{ n }] = await tx.query<{ n: number }>(`select nextval('req_number_seq')::integer as n`);
    const reqNumber = `MFR-${String(n).padStart(6, '0')}`;
    const i = p.input;
    const [row] = await tx.query<{ id: number }>(
      `insert into requisitions(req_number, status, source, crew_id, requester_id, requester_name_raw, pb_location, pb_location_raw,
                                pb_number, request_date, approver_id, approval_signature_present, notes, flags, confidence, fingerprint,
                                scan_page_id, verified_at, verified_by, created_by)
       values ($1, 'posted', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now(), $17, $17) returning id`,
      [
        reqNumber, ctx.source, i.crewId, i.requesterId, i.requesterNameRaw, p.pbLocation, i.pbLocationRaw.trim(), p.pbNumber,
        i.requestDate, i.approverId, i.approvalSignaturePresent, i.notes, i.flags, i.confidence, p.fingerprint,
        ctx.scanPageId ?? null, ctx.userId,
      ],
    );
    await insertLines(tx, row.id, i);

    if (ctx.scanPageId != null) {
      const claimed = await tx.query(
        `update scan_pages set status = 'posted', requisition_id = $2 where id = $1 and status = 'needs_review' returning id`,
        [ctx.scanPageId, row.id],
      );
      if (!claimed.length) throw new AppError('conflict', 'That scan page is not waiting for review.');
    }
    await audit(tx, {
      userId: ctx.userId,
      action: 'requisition.create',
      entity: 'requisition',
      entityId: row.id,
      detail: { reqNumber, source: ctx.source, scanPageId: ctx.scanPageId ?? null },
    });
    return { ok: true as const, id: row.id, reqNumber };
  });
}

/** The editable content of a stored requisition, in the shape of the input, for the audit log. */
function snapshot(d: RequisitionDetail) {
  return {
    crewId: d.crewId,
    requesterId: d.requesterId,
    requesterNameRaw: d.requesterNameRaw,
    pbLocationRaw: d.pbLocationRaw ?? d.pbLocation,
    requestDate: d.requestDate,
    approverId: d.approverId,
    approvalSignaturePresent: d.approvalSignaturePresent,
    notes: d.notes,
    confidence: d.confidence,
    flags: d.flags,
    lines: d.lines.map((l) => ({
      partId: l.partId,
      partNumberRaw: l.partNumberRaw,
      qtyRaw: l.qtyRaw,
      qtyRequested: l.qtyRequested,
      dateRequired: l.dateRequired,
      sisInitialed: l.sisInitialed,
      qtyIssued: l.qtyIssued,
    })),
  };
}

export async function updateRequisition(db: Db, id: number, rawInput: RequisitionInput, userId: number): Promise<UpdateResult> {
  return db.tx(async (tx) => {
    const before = await getRequisition(tx, id);
    if (!before) throw new AppError('not_found', 'Requisition not found.');
    if (before.status === 'void') throw new AppError('conflict', 'A void requisition cannot be edited.');

    const p = await prepare(tx, rawInput);
    const dupes = await findDuplicates(tx, p.fingerprint, id);
    if (dupes.length && !p.input.duplicateAcknowledged) return { ok: false as const, duplicates: dupes };

    const i = p.input;
    await tx.query(
      `update requisitions set crew_id = $2, requester_id = $3, requester_name_raw = $4, pb_location = $5, pb_location_raw = $6,
              pb_number = $7, request_date = $8, approver_id = $9, approval_signature_present = $10, notes = $11, flags = $12,
              confidence = $13, fingerprint = $14, updated_at = now()
       where id = $1`,
      [id, i.crewId, i.requesterId, i.requesterNameRaw, p.pbLocation, i.pbLocationRaw.trim(), p.pbNumber, i.requestDate,
       i.approverId, i.approvalSignaturePresent, i.notes, i.flags, i.confidence, p.fingerprint],
    );
    await tx.query(`delete from requisition_lines where requisition_id = $1`, [id]);
    await insertLines(tx, id, i);

    const after = (await getRequisition(tx, id)) as RequisitionDetail;
    await audit(tx, {
      userId,
      action: 'requisition.update',
      entity: 'requisition',
      entityId: id,
      detail: { before: snapshot(before), after: snapshot(after) },
    });
    return { ok: true as const };
  });
}

export async function getRequisition(db: Db, id: number): Promise<RequisitionDetail | null> {
  const [h] = await db.query<Omit<RequisitionDetail, 'lines' | 'auditEntries'>>(
    `select r.id, r.req_number as "reqNumber", r.status, r.source, r.crew_id as "crewId", c.code as "crewCode", c.name as "crewName",
            r.requester_id as "requesterId", r.requester_name_raw as "requesterNameRaw", r.pb_location as "pbLocation",
            r.pb_location_raw as "pbLocationRaw", r.pb_number as "pbNumber", r.request_date as "requestDate",
            r.approver_id as "approverId", r.approval_signature_present as "approvalSignaturePresent", r.notes, r.flags,
            r.confidence, r.scan_page_id as "scanPageId", r.verified_at as "verifiedAt", r.verified_by as "verifiedBy",
            r.void_reason as "voidReason", r.created_at as "createdAt", r.updated_at as "updatedAt"
     from requisitions r join crews c on c.id = r.crew_id where r.id = $1`,
    [id],
  );
  if (!h) return null;
  const lines = await db.query<RequisitionLineDetail>(
    `select l.id, l.line_no as "lineNo", l.part_id as "partId", p.part_number as "partNumber", l.part_number_raw as "partNumberRaw",
            l.description_raw as "descriptionRaw", l.is_write_in as "isWriteIn", l.qty_raw as "qtyRaw",
            l.qty_requested as "qtyRequested", l.pack_qty as "packQty", l.pack_unit as "packUnit", l.unit_word as "unitWord",
            l.date_required as "dateRequired", l.sis_initialed as "sisInitialed", l.qty_issued as "qtyIssued",
            l.issued_on as "issuedOn", l.confidence, l.flags, l.note
     from requisition_lines l left join parts p on p.id = l.part_id
     where l.requisition_id = $1 order by l.line_no`,
    [id],
  );
  const auditEntries = await db.query<AuditEntry>(
    `select a.id, a.at, a.action, u.full_name as "userName", a.detail
     from audit_log a left join app_users u on u.id = a.user_id
     where a.entity = 'requisition' and a.entity_id = $1 order by a.id`,
    [id],
  );
  return { ...h, lines, auditEntries };
}

export async function verifyRequisition(db: Db, id: number, userId: number): Promise<void> {
  const rows = await db.query<{ status: string }>(`select status from requisitions where id = $1`, [id]);
  if (!rows.length) throw new AppError('not_found', 'Requisition not found.');
  if (rows[0].status === 'void') throw new AppError('conflict', 'A void requisition cannot be verified.');
  await db.query(`update requisitions set verified_at = coalesce(verified_at, now()), verified_by = coalesce(verified_by, $2) where id = $1`, [id, userId]);
  await audit(db, { userId, action: 'requisition.verify', entity: 'requisition', entityId: id });
}

export async function voidRequisition(db: Db, id: number, userId: number, reason: string): Promise<void> {
  if (!reason || reason.trim() === '') throw new AppError('validation', 'Enter a reason for voiding.');
  const rows = await db.query<{ status: string }>(`select status from requisitions where id = $1`, [id]);
  if (!rows.length) throw new AppError('not_found', 'Requisition not found.');
  if (rows[0].status === 'void') throw new AppError('conflict', 'This requisition is already void.');
  await db.query(`update requisitions set status = 'void', void_reason = $2, updated_at = now() where id = $1`, [id, reason.trim()]);
  await audit(db, { userId, action: 'requisition.void', entity: 'requisition', entityId: id, detail: { reason: reason.trim() } });
}

/** Marks pending lines as issued in full. Lines already initialed or without an each-count are skipped. */
export async function markLinesIssued(
  db: Db,
  lineIds: number[],
  issuedOn: string,
  userId: number,
): Promise<{ updated: number; skipped: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn)) throw new AppError('validation', 'Enter the issue date.');
  const unique = [...new Set(lineIds)];
  if (!unique.length) return { updated: 0, skipped: 0 };
  return db.tx(async (tx) => {
    const done = await tx.query<{ id: number; requisition_id: number }>(
      `update requisition_lines l
          set sis_initialed = true, qty_issued = l.qty_requested, issued_on = $2
         from requisitions r
        where r.id = l.requisition_id and r.status = 'posted' and l.id = any($1::integer[])
          and not l.sis_initialed and l.qty_requested is not null
        returning l.id, l.requisition_id`,
      [unique, issuedOn],
    );
    const byReq = new Map<number, number[]>();
    for (const r of done) byReq.set(r.requisition_id, [...(byReq.get(r.requisition_id) ?? []), r.id]);
    for (const [reqId, ids] of byReq) {
      await tx.query(`update requisitions set updated_at = now() where id = $1`, [reqId]);
      await audit(tx, { userId, action: 'lines.issue', entity: 'requisition', entityId: reqId, detail: { lineIds: ids, issuedOn } });
    }
    return { updated: done.length, skipped: unique.length - done.length };
  });
}

/** The next posted, unverified requisition after the given id, or null. Without an id, the first one. */
export async function nextUnverified(db: Db, afterId?: number): Promise<number | null> {
  const rows = await db.query<{ id: number }>(
    `select id from requisitions where status = 'posted' and verified_at is null and ($1::integer is null or id > $1) order by id limit 1`,
    [afterId ?? null],
  );
  return rows[0]?.id ?? null;
}

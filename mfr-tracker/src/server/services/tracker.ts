import type { Db } from '../db/types';
import type { Confidence, PackUnit } from '@/domain/types';

export interface TrackerFilters {
  from?: string;
  to?: string;
  crew?: string[];
  requesterId?: number;
  pb?: string;
  partId?: number[];
  issue?: 'issued' | 'pending';
  verified?: boolean;
  review?: boolean;
  unresolved?: boolean;
  source?: 'scan' | 'manual' | 'seed';
  q?: string;
  includeVoid?: boolean;
  sort?: 'date_desc' | 'date_asc' | 'pb' | 'part';
}

export interface TrackerRow {
  lineId: number;
  requisitionId: number;
  reqNumber: string;
  status: 'posted' | 'void';
  source: 'scan' | 'manual' | 'seed';
  requestDate: string;
  crewCode: string;
  crewName: string;
  requester: string | null;
  pbLocation: string;
  pbNumber: number | null;
  lineNo: number;
  partId: number | null;
  partNumber: string | null;
  partName: string | null;
  partNumberRaw: string | null;
  isWriteIn: boolean;
  qtyRaw: string | null;
  qtyRequested: number | null;
  qtyIssued: number;
  packQty: number | null;
  packUnit: PackUnit | null;
  dateRequired: string | null;
  sisInitialed: boolean;
  issueStatus: 'issued' | 'pending';
  lineConfidence: Confidence;
  lineFlags: string[];
  lineNote: string | null;
  verified: boolean;
  formConfidence: Confidence;
  formFlags: string[];
  formNotes: string | null;
  scanPageId: number | null;
}

export interface TrackerResult {
  rows: TrackerRow[];
  totalLines: number;
  totalRequisitions: number;
  sumRequested: number;
  sumIssued: number;
}

export const TRACKER_PAGE_SIZE = 100;

type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

function all(raw: RawParams, key: string): string[] {
  if (raw instanceof URLSearchParams) return raw.getAll(key);
  const v = raw[key];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TRUE = new Set(['1', 'true', 'yes']);
const FALSE = new Set(['0', 'false', 'no']);

/** Reads tracker filters from URL search params. Unknown keys and values that are not allowed are ignored. */
export function parseTrackerFilters(raw: RawParams): TrackerFilters {
  const f: TrackerFilters = {};
  const one = (k: string) => all(raw, k)[0]?.trim() ?? '';

  if (ISO.test(one('from'))) f.from = one('from');
  if (ISO.test(one('to'))) f.to = one('to');
  const crew = all(raw, 'crew').map((c) => c.trim()).filter(Boolean);
  if (crew.length) f.crew = crew;
  if (/^\d+$/.test(one('requester'))) f.requesterId = Number(one('requester'));
  if (one('pb')) f.pb = one('pb');
  const parts = all(raw, 'part').filter((p) => /^\d+$/.test(p.trim())).map(Number);
  if (parts.length) f.partId = parts;
  if (one('issue') === 'issued' || one('issue') === 'pending') f.issue = one('issue') as 'issued' | 'pending';
  if (TRUE.has(one('verified'))) f.verified = true;
  else if (FALSE.has(one('verified'))) f.verified = false;
  if (TRUE.has(one('review'))) f.review = true;
  if (TRUE.has(one('unresolved'))) f.unresolved = true;
  if (['scan', 'manual', 'seed'].includes(one('source'))) f.source = one('source') as TrackerFilters['source'];
  if (one('q')) f.q = one('q');
  if (TRUE.has(one('void'))) f.includeVoid = true;
  if (['date_desc', 'date_asc', 'pb', 'part'].includes(one('sort'))) f.sort = one('sort') as TrackerFilters['sort'];
  return f;
}

/** The inverse of parseTrackerFilters, for links and export URLs. */
export function trackerFiltersToQuery(f: TrackerFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.from) sp.set('from', f.from);
  if (f.to) sp.set('to', f.to);
  for (const c of f.crew ?? []) sp.append('crew', c);
  if (f.requesterId != null) sp.set('requester', String(f.requesterId));
  if (f.pb) sp.set('pb', f.pb);
  for (const p of f.partId ?? []) sp.append('part', String(p));
  if (f.issue) sp.set('issue', f.issue);
  if (f.verified !== undefined) sp.set('verified', f.verified ? 'yes' : 'no');
  if (f.review) sp.set('review', '1');
  if (f.unresolved) sp.set('unresolved', '1');
  if (f.source) sp.set('source', f.source);
  if (f.q) sp.set('q', f.q);
  if (f.includeVoid) sp.set('void', '1');
  if (f.sort) sp.set('sort', f.sort);
  return sp;
}

// Sort options map to fixed fragments. User input never reaches the SQL text.
const ORDER: Record<NonNullable<TrackerFilters['sort']>, string> = {
  date_desc: 'request_date desc, req_number desc, line_no asc',
  date_asc: 'request_date asc, req_number asc, line_no asc',
  pb: 'pb_number asc nulls last, pb_location asc, request_date asc, req_number asc, line_no asc',
  part: 'part_number asc nulls last, request_date asc, req_number asc, line_no asc',
};

function buildWhere(f: TrackerFilters): { where: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, ...values: unknown[]) => {
    let s = sql;
    for (const v of values) {
      params.push(v);
      s = s.replace('?', `$${params.length}`);
    }
    conds.push(s);
  };

  if (!f.includeVoid) conds.push(`status = 'posted'`);
  if (f.from) add('request_date >= ?::date', f.from);
  if (f.to) add('request_date <= ?::date', f.to);
  if (f.crew?.length) add('crew_code = any(?::text[])', f.crew);
  if (f.requesterId != null) add('requisition_id in (select id from requisitions where requester_id = ?)', f.requesterId);
  if (f.pb) {
    const pb = f.pb.trim();
    const range = /^(\d+)-(\d+)$/.exec(pb);
    if (range) add('pb_number between ? and ?', Number(range[1]), Number(range[2]));
    else if (/^\d+$/.test(pb)) add('pb_number = ?', Number(pb));
    else add('lower(pb_location) = lower(?)', pb);
  }
  if (f.partId?.length) add('part_id = any(?::integer[])', f.partId);
  if (f.issue) add('issue_status = ?', f.issue);
  if (f.verified !== undefined) add('verified = ?', f.verified);
  if (f.review) conds.push(`(line_confidence <> 'high' or form_confidence <> 'high')`);
  if (f.unresolved) conds.push('part_id is null');
  if (f.source) add('source = ?', f.source);
  if (f.q) {
    params.push(f.q);
    const p = `$${params.length}`;
    conds.push(
      `(${['req_number', 'form_notes', 'line_note', 'part_number_raw', 'part_number']
        .map((c) => `position(lower(${p}) in lower(coalesce(${c}, ''))) > 0`)
        .join(' or ')})`,
    );
  }
  return { where: conds.length ? `where ${conds.join(' and ')}` : '', params };
}

const SELECT = `
  select line_id as "lineId", requisition_id as "requisitionId", req_number as "reqNumber", status, source,
         request_date as "requestDate", crew_code as "crewCode", crew_name as "crewName", requester,
         pb_location as "pbLocation", pb_number as "pbNumber", line_no as "lineNo", part_id as "partId",
         part_number as "partNumber", part_name as "partName", part_number_raw as "partNumberRaw",
         is_write_in as "isWriteIn", qty_raw as "qtyRaw", qty_requested as "qtyRequested", qty_issued as "qtyIssued",
         pack_qty as "packQty", pack_unit as "packUnit", date_required as "dateRequired", sis_initialed as "sisInitialed",
         issue_status as "issueStatus", line_confidence as "lineConfidence", line_flags as "lineFlags",
         line_note as "lineNote", verified, form_confidence as "formConfidence", form_flags as "formFlags",
         form_notes as "formNotes", scan_page_id as "scanPageId"
  from v_tracker_lines`;

export async function queryTracker(
  db: Db,
  filters: TrackerFilters,
  paging: { page: number; pageSize: number },
): Promise<TrackerResult> {
  const { where, params } = buildWhere(filters);
  const order = ORDER[filters.sort ?? 'date_desc'];
  const pageSize = Math.max(1, Math.min(paging.pageSize, 1000));
  const offset = (Math.max(1, paging.page) - 1) * pageSize;

  const rows = await db.query<TrackerRow>(
    `${SELECT} ${where} order by ${order}, line_id asc limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, pageSize, offset],
  );
  const [t] = await db.query<{ lines: number; reqs: number; requested: number; issued: number }>(
    `select count(*) as lines, count(distinct requisition_id) as reqs,
            coalesce(sum(qty_requested), 0)::bigint as requested, coalesce(sum(qty_issued), 0)::bigint as issued
     from v_tracker_lines ${where}`,
    params,
  );
  return { rows, totalLines: t.lines, totalRequisitions: t.reqs, sumRequested: t.requested, sumIssued: t.issued };
}

/** Every matching row, no paging, in the same order as the screen. */
export async function exportTracker(db: Db, filters: TrackerFilters): Promise<TrackerRow[]> {
  const { where, params } = buildWhere(filters);
  return db.query<TrackerRow>(`${SELECT} ${where} order by ${ORDER[filters.sort ?? 'date_desc']}, line_id asc`, params);
}

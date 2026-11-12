// Parsers for the three handwritten fields on a Material Field Requisition.
// PROVIDED AND TESTED against seed/parse_vectors.json (462 real cases). Do not rewrite; extend only with new tests.
import type { ParsedPb, ParsedQty, PartPack } from './types';

const DASH = /^[\u2014\u2013\-_]+$/;

/**
 * "596 bolts" -> 596 | "5,604 bolts" -> 5604 | "1 Pallet/3840" -> 3840 (1 pallet) | "2 Boxes/930" -> 930 (2 boxes)
 * "3 Boxes" -> boxes x part.eachPerBox, else null + 'pack_only' | "100's" -> null + 'ambiguous_qty'
 * blank or a dash -> null (no line was requested).
 */
export function parseQty(raw: string | null | undefined, part?: PartPack | null): ParsedQty | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === '' || DASH.test(s)) return null;
  const out: ParsedQty = { qtyEach: null, packQty: null, packUnit: null, unitWord: null, flags: [] };
  const t = s
    .replace(/(?<=\d),\s*(?=\d)/g, '')
    .toLowerCase()
    .replace(/\.+$/, '')
    .trim();

  let m = /^(\d+)\s*(pallets?|boxes|box)\s*\/\s*(\d+)$/.exec(t);
  if (m) {
    out.packQty = Number(m[1]);
    out.packUnit = m[2].startsWith('pallet') ? 'pallet' : 'box';
    out.qtyEach = Number(m[3]);
    return out;
  }

  m = /^(\d+)\s*(pallets?|boxes|box)$/.exec(t);
  if (m) {
    out.packQty = Number(m[1]);
    out.packUnit = m[2].startsWith('pallet') ? 'pallet' : 'box';
    const per = part ? (out.packUnit === 'pallet' ? part.eachPerPallet : part.eachPerBox) : null;
    if (per) out.qtyEach = out.packQty * per;
    else out.flags.push('pack_only');
    return out;
  }

  if (/^\d+\s*['\u2019]\s*s$/.test(t)) {
    out.flags.push('ambiguous_qty');
    return out;
  }

  m = /^(\d+)\s*([a-z]+)?$/.exec(t);
  if (m) {
    out.qtyEach = Number(m[1]);
    out.unitWord = m[2] ?? null;
    return out;
  }

  out.flags.push('unparsed');
  return out;
}

function iso(y: number, mo: number, d: number): string | null {
  const ms = Date.UTC(y, mo - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Month-first dates as written on the forms: "9-8", "9/28/26", "09-14-2026", "10.30".
 * No year written: use the anchor's year (the request date) or defaultYear. If that lands more than
 * 180 days before the anchor, roll to the next year (December request, January need-by).
 * Returns ISO "YYYY-MM-DD" or null.
 */
export function parseDate(
  raw: string | null | undefined,
  opts: { defaultYear: number; anchor?: string | null },
): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  const m = /^(\d{1,2})\s*[-/.]\s*(\d{1,2})(?:\s*[-/.]\s*(\d{2}|\d{4}))?$/.exec(s);
  if (!m) return null;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  if (m[3]) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return iso(y, mo, d);
  }
  const anchorMs = opts.anchor ? Date.parse(`${opts.anchor}T00:00:00Z`) : NaN;
  const hasAnchor = !Number.isNaN(anchorMs);
  const y = hasAnchor ? new Date(anchorMs).getUTCFullYear() : opts.defaultYear;
  let val = iso(y, mo, d);
  if (val && hasAnchor) {
    const diffDays = (anchorMs - Date.parse(`${val}T00:00:00Z`)) / 86_400_000;
    if (diffDays > 180) val = iso(y + 1, mo, d);
  }
  return val;
}

/** "PB 55" -> {pbLocation:"55", pbNumber:55} | "103" -> 103 | "FOR LDYs" -> {pbLocation:"FOR LDYs", pbNumber:null} */
export function parsePb(raw: string | null | undefined): ParsedPb {
  const s = (raw ?? '').trim();
  const t = s.replace(/^\s*pb\.?\s*/i, '').trim();
  if (/^\d{1,3}$/.test(t)) {
    const n = Number(t);
    return { pbLocation: String(n), pbNumber: n };
  }
  return { pbLocation: s, pbNumber: null };
}

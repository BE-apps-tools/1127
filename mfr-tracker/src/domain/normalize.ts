// Turns an AI extraction into a draft form. Pure domain code, no I/O.
import type { ExtractionResult } from './extraction';
import type { RequisitionInput, RequisitionLineInput } from './requisition-input';
import type { CheckWarning, Confidence, CrewCheck } from './types';
import { parseDate, parseQty } from './parse';
import { resolvePart, runCrewChecks } from './rules';

export interface Lookups {
  crews: Array<{
    id: number;
    code: string;
    name: string;
    defaultRequesterId: number | null;
    checks: CrewCheck[];
    parts: Array<{ partId: number; partNumber: string; label: string }>;
  }>;
  parts: Array<{
    id: number;
    partNumber: string;
    label: string;
    eachPerBox: number | null;
    eachPerPallet: number | null;
    needsReview: boolean;
    isActive: boolean;
  }>;
  aliases: Array<{ alias: string; partId: number }>;
  people: Array<{ id: number; fullName: string; isRequester: boolean; isApprover: boolean; isActive: boolean }>;
}

export interface DraftLine extends RequisitionLineInput {
  dateRequiredRaw: string | null;
}

export interface Draft {
  form: Omit<RequisitionInput, 'lines' | 'duplicateAcknowledged' | 'crewId' | 'requestDate'> & {
    crewId: number | null;
    requestDate: string | null;
    requestDateRaw: string | null;
  };
  lines: DraftLine[];
  warnings: CheckWarning[];
}

const DAY_MS = 86_400_000;

/**
 * Parses a request date written without a reliable year. A date with no year written that lands
 * more than 60 days after `today` belongs to the previous year.
 */
export function inferRequestDate(raw: string | null, today: string): string | null {
  const todayYear = Number(today.slice(0, 4));
  // Anchoring on today lets a January date written in late December roll forward into the next year.
  const parsed = parseDate(raw, { defaultYear: todayYear, anchor: today });
  if (!parsed || raw == null) return parsed;
  const hadYear = /^\s*\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}\s*$/.test(raw);
  if (hadYear) return parsed;
  const ahead = (Date.parse(`${parsed}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS;
  if (ahead > 60) {
    const [y, m, d] = parsed.split('-');
    return `${Number(y) - 1}-${m}-${d}`;
  }
  return parsed;
}

const lower = (a: Confidence, b: Confidence): Confidence => {
  const rank: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };
  return rank[a] <= rank[b] ? a : b;
};

export function normalizeExtraction(x: ExtractionResult, lookups: Lookups, today: string): Draft {
  const crew = lookups.crews.find((c) => c.code === x.form.crew_code) ?? null;
  const requesterText = x.form.requester;
  const requester = requesterText
    ? lookups.people.find((p) => p.isActive && p.fullName.toLowerCase() === requesterText.trim().toLowerCase())
    : undefined;

  const requestDate = inferRequestDate(x.form.request_date_raw, today);
  const dateOpts = { defaultYear: Number((requestDate ?? today).slice(0, 4)), anchor: requestDate };

  let defaultNeedBy = parseDate(x.form.date_required_default_raw, dateOpts);
  if (!defaultNeedBy) {
    for (const l of x.lines) {
      const d = parseDate(l.date_required_raw, dateOpts);
      if (d) {
        defaultNeedBy = d;
        break;
      }
    }
  }

  const activeParts = lookups.parts.filter((p) => p.isActive).map((p) => ({ id: p.id, partNumber: p.partNumber }));

  const lines: DraftLine[] = x.lines.map((l) => {
    const flags = new Set<string>(l.flags);
    const { partId } = resolvePart(l.part_number_raw, activeParts, lookups.aliases);
    if (partId == null) flags.add('part_unresolved');
    const part = partId == null ? null : lookups.parts.find((p) => p.id === partId) ?? null;

    const parsed = parseQty(l.qty_raw, part ? { eachPerBox: part.eachPerBox, eachPerPallet: part.eachPerPallet } : null);
    for (const f of parsed?.flags ?? []) flags.add(f);
    const qtyRequested = parsed?.qtyEach ?? null;

    let confidence = l.confidence;
    if ((l.qty_each ?? null) !== qtyRequested) {
      flags.add('parse_mismatch');
      confidence = lower(confidence, 'medium');
    }

    const ownDate = parseDate(l.date_required_raw, dateOpts);
    return {
      partId,
      partNumberRaw: l.part_number_raw,
      descriptionRaw: l.description_raw,
      isWriteIn: l.is_write_in,
      qtyRaw: l.qty_raw,
      qtyRequested,
      packQty: parsed?.packQty ?? null,
      packUnit: parsed?.packUnit ?? null,
      unitWord: parsed?.unitWord ?? null,
      dateRequired: ownDate ?? defaultNeedBy,
      dateRequiredRaw: l.date_required_raw,
      sisInitialed: l.sis_initialed,
      confidence,
      flags: [...flags].sort(),
      note: l.note,
    };
  });

  const warnings = crew
    ? runCrewChecks(
        crew.checks,
        lines.map((l) => ({
          partNumber: l.partId == null ? null : (lookups.parts.find((p) => p.id === l.partId)?.partNumber ?? null),
          qtyEach: l.qtyRequested,
          isWriteIn: l.isWriteIn,
        })),
      )
    : [];

  return {
    form: {
      crewId: crew?.id ?? null,
      requesterId: requester?.id ?? null,
      requesterNameRaw: requesterText,
      pbLocationRaw: x.form.pb_location_raw ?? '',
      requestDate,
      requestDateRaw: x.form.request_date_raw,
      approverId: null,
      approvalSignaturePresent: x.form.approval_signature_present,
      notes: x.form.notes,
      confidence: x.form.confidence,
      flags: [...x.form.flags].sort(),
    },
    lines,
    warnings,
  };
}

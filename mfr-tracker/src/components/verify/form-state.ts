// Pure form logic for the verify, requisition and new-requisition screens. No React, no I/O.
import type { Draft, DraftLine, Lookups } from '@/domain/normalize';
import { parseQty } from '@/domain/parse';
import { resolvePart, runCrewChecks } from '@/domain/rules';
import type { RequisitionInput, RequisitionLineInput } from '@/domain/requisition-input';
import type { CheckWarning, Confidence, PackUnit } from '@/domain/types';
import type { RequisitionDetail } from '@/server/services/requisitions';

export interface LineState {
  key: string;
  /** What is in the part picker. Free text is allowed for write-ins. */
  partText: string;
  partId: number | null;
  descriptionRaw: string | null;
  isWriteIn: boolean;
  /** "As written". */
  qtyRaw: string;
  /** What is in the "Each" input. */
  eachText: string;
  /** True once the user has typed in Each; the parser then stops refilling it. */
  eachEdited: boolean;
  qtyRequested: number | null;
  packQty: number | null;
  packUnit: PackUnit | null;
  unitWord: string | null;
  /** ISO date, or empty. */
  dateRequired: string;
  sisInitialed: boolean;
  confidence: Confidence;
  flags: string[];
  note: string | null;
}

export interface FormState {
  crewId: number | null;
  requesterId: number | null;
  requesterNameRaw: string | null;
  pbLocationRaw: string;
  requestDate: string;
  approverId: number | null;
  approvalSignaturePresent: boolean | null;
  notes: string;
  confidence: Confidence;
  flags: string[];
  lines: LineState[];
}

let counter = 0;
const nextKey = () => `l${++counter}`;

const activeParts = (lookups: Lookups) => lookups.parts.filter((p) => p.isActive).map((p) => ({ id: p.id, partNumber: p.partNumber }));

function blankLine(over: Partial<LineState> = {}): LineState {
  return {
    key: nextKey(),
    partText: '',
    partId: null,
    descriptionRaw: null,
    isWriteIn: false,
    qtyRaw: '',
    eachText: '',
    eachEdited: false,
    qtyRequested: null,
    packQty: null,
    packUnit: null,
    unitWord: null,
    dateRequired: '',
    sisInitialed: false,
    confidence: 'high',
    flags: [],
    note: null,
    ...over,
  };
}

const partOf = (lookups: Lookups, id: number | null) => (id == null ? null : (lookups.parts.find((p) => p.id === id) ?? null));
const withLine = (s: FormState, i: number, line: LineState): FormState => ({ ...s, lines: s.lines.map((l, j) => (j === i ? line : l)) });

/** Re-parses "As written" with the part's pack sizes and fills Each, pack and unit unless Each was typed by hand. */
function reparse(line: LineState, lookups: Lookups): LineState {
  if (line.eachEdited) return line;
  const part = partOf(lookups, line.partId);
  const parsed = parseQty(line.qtyRaw, part ? { eachPerBox: part.eachPerBox, eachPerPallet: part.eachPerPallet } : null);
  const each = parsed?.qtyEach ?? null;
  const next: LineState = {
    ...line,
    qtyRequested: each,
    eachText: each == null ? '' : String(each),
    packQty: parsed?.packQty ?? null,
    packUnit: parsed?.packUnit ?? null,
    unitWord: parsed?.unitWord ?? null,
  };
  if (each == null) next.sisInitialed = false;
  return next;
}

function fromDraftLine(l: DraftLine, lookups: Lookups): LineState {
  const part = partOf(lookups, l.partId);
  return blankLine({
    partText: part?.partNumber ?? l.partNumberRaw ?? '',
    partId: l.partId,
    descriptionRaw: l.descriptionRaw,
    isWriteIn: l.isWriteIn,
    qtyRaw: l.qtyRaw ?? '',
    eachText: l.qtyRequested == null ? '' : String(l.qtyRequested),
    eachEdited: false,
    qtyRequested: l.qtyRequested,
    packQty: l.packQty,
    packUnit: l.packUnit,
    unitWord: l.unitWord,
    dateRequired: l.dateRequired ?? '',
    sisInitialed: l.sisInitialed,
    confidence: l.confidence,
    flags: l.flags,
    note: l.note,
  });
}

export function fromDraft(draft: Draft, lookups: Lookups): FormState {
  return {
    crewId: draft.form.crewId,
    requesterId: draft.form.requesterId,
    requesterNameRaw: draft.form.requesterNameRaw,
    pbLocationRaw: draft.form.pbLocationRaw,
    requestDate: draft.form.requestDate ?? '',
    approverId: draft.form.approverId,
    approvalSignaturePresent: draft.form.approvalSignaturePresent,
    notes: draft.form.notes ?? '',
    confidence: draft.form.confidence,
    flags: draft.form.flags,
    lines: draft.lines.map((l) => fromDraftLine(l, lookups)),
  };
}

export function fromRequisition(d: RequisitionDetail): FormState {
  return {
    crewId: d.crewId,
    requesterId: d.requesterId,
    requesterNameRaw: d.requesterNameRaw,
    pbLocationRaw: d.pbLocationRaw ?? d.pbLocation,
    requestDate: d.requestDate,
    approverId: d.approverId,
    approvalSignaturePresent: d.approvalSignaturePresent,
    notes: d.notes ?? '',
    confidence: d.confidence,
    flags: d.flags,
    lines: d.lines.map((l) =>
      blankLine({
        partText: l.partNumber ?? l.partNumberRaw ?? '',
        partId: l.partId,
        descriptionRaw: l.descriptionRaw,
        isWriteIn: l.isWriteIn,
        qtyRaw: l.qtyRaw ?? '',
        eachText: l.qtyRequested == null ? '' : String(l.qtyRequested),
        // Stored values are authoritative; do not let re-parsing replace them until the text is edited again.
        eachEdited: true,
        qtyRequested: l.qtyRequested,
        packQty: l.packQty,
        packUnit: l.packUnit,
        unitWord: l.unitWord,
        dateRequired: l.dateRequired ?? '',
        sisInitialed: l.sisInitialed,
        confidence: l.confidence,
        flags: l.flags,
        note: l.note,
      }),
    ),
  };
}

/** A blank form for a crew: its pre-printed parts as rows, in order, and its default requester. */
export function emptyForCrew(crew: Lookups['crews'][number], lookups: Lookups): FormState {
  const requester = lookups.people.find((p) => p.id === crew.defaultRequesterId) ?? null;
  return {
    crewId: crew.id,
    requesterId: requester?.id ?? null,
    requesterNameRaw: requester?.fullName ?? null,
    pbLocationRaw: '',
    requestDate: '',
    approverId: null,
    approvalSignaturePresent: null,
    notes: '',
    confidence: 'high',
    flags: [],
    lines: crew.parts.map((p) => blankLine({ partText: p.partNumber, partId: p.partId, descriptionRaw: p.label })),
  };
}

export function setAsWritten(s: FormState, i: number, text: string, lookups: Lookups): FormState {
  return withLine(s, i, reparse({ ...s.lines[i], qtyRaw: text }, lookups));
}

export function setEach(s: FormState, i: number, value: string): FormState {
  const digits = value.replace(/[,\s]/g, '');
  const n = /^\d+$/.test(digits) ? Number(digits) : null;
  const line: LineState = {
    ...s.lines[i],
    eachText: value,
    qtyRequested: n,
    eachEdited: value.trim() !== '',
  };
  if (n == null) line.sisInitialed = false;
  return withLine(s, i, line);
}

export function setPart(s: FormState, i: number, text: string, lookups: Lookups): FormState {
  const { partId } = resolvePart(text, activeParts(lookups), lookups.aliases);
  const flags = new Set(s.lines[i].flags);
  if (partId == null && text.trim() !== '') flags.add('part_unresolved');
  else flags.delete('part_unresolved');
  return withLine(s, i, reparse({ ...s.lines[i], partText: text, partId, flags: [...flags].sort() }, lookups));
}

export function setDate(s: FormState, i: number, iso: string): FormState {
  return withLine(s, i, { ...s.lines[i], dateRequired: iso });
}

export function setInitialed(s: FormState, i: number, checked: boolean): FormState {
  const line = s.lines[i];
  return withLine(s, i, { ...line, sisInitialed: checked && line.qtyRequested != null });
}

export function toggleAll(s: FormState, checked: boolean): FormState {
  return { ...s, lines: s.lines.map((l) => ({ ...l, sisInitialed: checked && l.qtyRequested != null })) };
}

export function addLine(s: FormState): FormState {
  return { ...s, lines: [...s.lines, blankLine({ isWriteIn: true })] };
}

export function removeLine(s: FormState, i: number): FormState {
  return { ...s, lines: s.lines.filter((_, j) => j !== i) };
}

/** Rows with no quantity text and no each-count are dropped. Line order is kept. */
export function toInput(s: FormState, duplicateAcknowledged: boolean): RequisitionInput {
  const lines: RequisitionLineInput[] = s.lines
    .filter((l) => l.qtyRaw.trim() !== '' || l.qtyRequested != null)
    .map((l) => ({
      partId: l.partId,
      partNumberRaw: l.partText.trim() === '' ? null : l.partText.trim(),
      descriptionRaw: l.descriptionRaw,
      isWriteIn: l.isWriteIn,
      qtyRaw: l.qtyRaw.trim() === '' ? null : l.qtyRaw.trim(),
      qtyRequested: l.qtyRequested,
      packQty: l.packQty,
      packUnit: l.packUnit,
      unitWord: l.unitWord,
      dateRequired: l.dateRequired === '' ? null : l.dateRequired,
      sisInitialed: l.sisInitialed,
      confidence: l.confidence,
      flags: l.flags,
      note: l.note,
    }));
  return {
    crewId: s.crewId ?? 0,
    requesterId: s.requesterId,
    requesterNameRaw: s.requesterNameRaw,
    pbLocationRaw: s.pbLocationRaw.trim(),
    requestDate: s.requestDate,
    approverId: s.approverId,
    approvalSignaturePresent: s.approvalSignaturePresent,
    notes: s.notes.trim() === '' ? null : s.notes.trim(),
    confidence: s.confidence,
    flags: s.flags,
    lines,
    duplicateAcknowledged,
  };
}

/** Friendly messages for what is missing, shown before anything is sent. */
export function formErrors(s: FormState): string[] {
  const errors: string[] = [];
  if (s.crewId == null) errors.push('Choose a crew.');
  if (s.pbLocationRaw.trim() === '') errors.push('Enter the PB location.');
  if (s.requestDate === '') errors.push('Enter the request date.');
  const kept = s.lines.filter((l) => l.qtyRaw.trim() !== '' || l.qtyRequested != null);
  if (kept.length === 0) errors.push('Add at least one line with a quantity.');
  kept.forEach((l) => {
    if (l.partText.trim() === '' && l.partId == null) errors.push('Every line needs a part number.');
    if (l.sisInitialed && l.qtyRequested == null) errors.push('Enter a quantity before marking a line as issued.');
  });
  return [...new Set(errors)];
}

export function warnings(s: FormState, lookups: Lookups): CheckWarning[] {
  const crew = lookups.crews.find((c) => c.id === s.crewId);
  if (!crew) return [];
  return runCrewChecks(
    crew.checks,
    s.lines.map((l) => ({ partNumber: partOf(lookups, l.partId)?.partNumber ?? null, qtyEach: l.qtyRequested, isWriteIn: l.isWriteIn })),
  );
}

/** True when any row already has a quantity typed, so changing the crew should ask first. */
export function hasTypedQuantities(s: FormState): boolean {
  return s.lines.some((l) => l.qtyRaw.trim() !== '' || l.qtyRequested != null);
}

/** A form with nothing chosen yet, for /requisitions/new. */
export function emptyForm(today: string): FormState {
  return {
    crewId: null,
    requesterId: null,
    requesterNameRaw: null,
    pbLocationRaw: '',
    requestDate: today,
    approverId: null,
    approvalSignaturePresent: null,
    notes: '',
    confidence: 'high',
    flags: [],
    lines: [],
  };
}

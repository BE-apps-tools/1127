// Shape and validation of a requisition as posted by the UI or the API. Pure domain code.
import { z } from 'zod';
import type { Confidence, PackUnit } from './types';

export interface RequisitionLineInput {
  partId: number | null;
  partNumberRaw: string | null;
  descriptionRaw: string | null;
  isWriteIn: boolean;
  qtyRaw: string | null;
  qtyRequested: number | null; // each-count, integer >= 0
  packQty: number | null;
  packUnit: PackUnit | null;
  unitWord: string | null;
  dateRequired: string | null; // ISO date
  sisInitialed: boolean;
  confidence: Confidence;
  flags: string[];
  note: string | null;
}

export interface RequisitionInput {
  crewId: number;
  requesterId: number | null;
  requesterNameRaw: string | null;
  pbLocationRaw: string; // non-empty after trim
  requestDate: string; // ISO date
  approverId: number | null;
  approvalSignaturePresent: boolean | null;
  notes: string | null;
  confidence: Confidence;
  flags: string[];
  lines: RequisitionLineInput[]; // at least one
  duplicateAcknowledged: boolean;
}

export const ISSUE_NEEDS_QTY_MESSAGE = 'Enter a quantity before marking a line as issued.';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-02.');
const confidence = z.enum(['high', 'medium', 'low']);
const blank = (s: string | null) => s == null || s.trim() === '';

const LineSchema = z
  .object({
    partId: z.number().int().positive().nullable(),
    partNumberRaw: z.string().nullable(),
    descriptionRaw: z.string().nullable(),
    isWriteIn: z.boolean(),
    qtyRaw: z.string().nullable(),
    qtyRequested: z.number().int().min(0).nullable(),
    packQty: z.number().int().min(0).nullable(),
    packUnit: z.enum(['box', 'pallet']).nullable(),
    unitWord: z.string().nullable(),
    dateRequired: isoDate.nullable(),
    sisInitialed: z.boolean(),
    confidence,
    flags: z.array(z.string()),
    note: z.string().nullable(),
  })
  .superRefine((line, ctx) => {
    if (line.partId == null && blank(line.partNumberRaw)) {
      ctx.addIssue({ code: 'custom', path: ['partNumberRaw'], message: 'Enter a part number.' });
    }
    if (blank(line.qtyRaw) && line.qtyRequested == null) {
      ctx.addIssue({ code: 'custom', path: ['qtyRaw'], message: 'Enter a quantity.' });
    }
    if (line.sisInitialed && line.qtyRequested == null) {
      ctx.addIssue({ code: 'custom', path: ['qtyRequested'], message: ISSUE_NEEDS_QTY_MESSAGE });
    }
  });

export const RequisitionInputSchema = z.object({
  crewId: z.number().int().positive(),
  requesterId: z.number().int().positive().nullable(),
  requesterNameRaw: z.string().nullable(),
  pbLocationRaw: z.string().refine((s) => s.trim() !== '', 'Enter a PB location.'),
  requestDate: isoDate,
  approverId: z.number().int().positive().nullable(),
  approvalSignaturePresent: z.boolean().nullable(),
  notes: z.string().nullable(),
  confidence,
  flags: z.array(z.string()),
  lines: z.array(LineSchema).min(1, 'Add at least one line.'),
  duplicateAcknowledged: z.boolean(),
});

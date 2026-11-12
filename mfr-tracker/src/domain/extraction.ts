// zod mirror of contracts/extraction.schema.json. Pure domain code.
import { z } from 'zod';

const FORM_FLAGS = [
  'pb_uncertain',
  'pb_text',
  'date_uncertain',
  'requester_missing',
  'requester_uncertain',
  'crew_inferred',
  'columns_swapped',
] as const;
const LINE_FLAGS = ['struck_through', 'write_in', 'part_label_mismatch', 'part_unresolved'] as const;

/** An array of strings that keeps only the values the contract names. Unknown strings are dropped, not rejected. */
function knownFlags(allowed: readonly string[]) {
  return z.array(z.string()).transform((flags) => flags.filter((f) => allowed.includes(f)));
}

const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
const nullableString = z.string().nullable();

export const ExtractionLineSchema = z.object({
  line_no: z.number().int(),
  part_number_raw: nullableString,
  description_raw: nullableString,
  is_write_in: z.boolean(),
  qty_raw: nullableString,
  qty_each: z.number().int().nullable(),
  date_required_raw: nullableString,
  sis_initialed: z.boolean(),
  confidence: ConfidenceSchema,
  flags: knownFlags(LINE_FLAGS),
  note: nullableString,
});

export const ExtractionFormSchema = z.object({
  crew_code: nullableString,
  crew_printed_text: nullableString,
  requester: nullableString,
  pb_location_raw: nullableString,
  request_date_raw: nullableString,
  date_required_default_raw: nullableString,
  approval_signature_present: z.boolean(),
  notes: nullableString,
  confidence: ConfidenceSchema,
  flags: knownFlags(FORM_FLAGS),
});

export const ExtractionResultSchema = z.object({
  is_requisition_form: z.boolean(),
  form: ExtractionFormSchema,
  lines: z.array(ExtractionLineSchema),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type ExtractionLine = z.infer<typeof ExtractionLineSchema>;

// The extraction prompt. The system text is copied verbatim from contracts/extraction_prompt.md.
import type { Lookups } from '@/domain/normalize';

export const SYSTEM_PROMPT_TEMPLATE = `You read scanned paper forms for a construction site inventory team and return the contents as JSON.

The form is a one-page "Material Field Requisition". A crew foreman fills it in by hand to request hardware
from the site inventory yard. Your output pre-fills a screen where a person compares your reading against the
scan and corrects it. They trust your confidence marks to decide where to look, so an honest "low" is far more
useful than a confident guess.

You get two images of the same page: the whole page, then an enlarged crop of the upper right area where the
handwritten numbers are. Use the crop to read digits and the whole page for layout.

FORM LAYOUT
- Title: "Material Field Requisition".
- Header row: "Foreman/Responsible Crew:" (a printed crew name, plus a foreman name that is stamped,
  photocopied or handwritten), "PB Locations:" (the power block the material is for), "Date:" (request date).
- A light-blue column header row: Part # | Description | Qty Needed | Date Required by: | SIS/IA.
- About fifteen table rows. On most forms the first few rows have a pre-printed part number and description
  for that crew. Rows below are blank and are sometimes used for handwritten extra parts.
- "Approved By:" with a signature at the bottom.

KNOWN CREW FORMS (code, printed crew text, pre-printed parts in row order)
{{CREWS_BLOCK}}

KNOWN FOREMAN NAMES
{{REQUESTERS_BLOCK}}

WHAT TO RETURN

Header
- crew_code: match the printed crew text, or the set of pre-printed part numbers, to one of the known crew
  forms. On a blank form with no printed crew, set a code only if the handwritten parts clearly belong to one
  crew and add the flag "crew_inferred". Otherwise null.
- crew_printed_text: the printed text after "Foreman/Responsible Crew:", exactly as printed.
- requester: the foreman name that stands. If a printed or stamped name is struck through and another name
  is written beside it, return the written one. If the name is scribbled out with no replacement, return null
  and add "requester_missing". Prefer the spelling from the known names list when it is clearly the same person.
- pb_location_raw: exactly what is written, such as "PB 55", "103" or "FOR LDYs". If a number is crossed out
  and replaced, return the one that stands. A circle around the number is not part of it.
- request_date_raw: exactly as written, such as "9-8" or "10/7/26". Do not add a year.
- date_required_default_raw: the first value written anywhere in the "Date Required by" column, exactly as
  written, even if it sits on a row that has no quantity. Many forms write this date once at the top of the
  column and mean it for every row. null when the column is empty.
- approval_signature_present: true if anything is signed or initialed in the "Approved By" area.
- notes: margin notes ("50 boxes", "Panels") and anything unusual about the page.

Lines
- Return one line for every row that has something written in Qty Needed. Skip rows where Qty Needed is blank
  or holds only a dash. A row with a handwritten part number counts even if its quantity is unusual.
- part_number_raw and description_raw: exactly as printed or handwritten on the row. If the part number is
  handwritten, set is_write_in true and add the flag "write_in". If a handwritten number does not look like
  any known part, add "part_unresolved". If a handwritten number and its handwritten label seem to name
  different parts, add "part_label_mismatch".
- qty_raw: exactly as written, including unit words and punctuation. Examples seen on these forms:
  "596 bolts", "4,492 bolts", "149 brackets", "720 ea", "20 pc", "1 Pallet/3840", "2 Boxes/930", "100's".
- qty_each: the count of individual items when it is unambiguous. "596 bolts" is 596. For
  "N Pallets/M" or "N Boxes/M", M is the item count, so "2 Pallets/7680" is 7680. If only a pack count is
  written ("3 Boxes") or the text is not a number ("100's"), return null.
- date_required_raw: exactly as written on that row. Many forms write the date once on the first row. Return
  it only on the row where it is written and null on the others.
- sis_initialed: true if the SIS/IA column has initials on that row. A single set of initials with a vertical
  line or arrow drawn down the column covers every row the line passes through. No mark means false.

Reading rules
- Report what is written. Never change a number to make it fit a pattern.
- Struck-through values: return the value that stands, add "struck_through", and put the struck value in note.
- If numbers are written in the Date Required column and dates in the Qty Needed column, put each back in
  its proper field and add "columns_swapped" to the form flags.
- Commas are thousands separators: "8,331" is 8331.
- Digits that are easy to confuse in this handwriting: 4, 6 and 9; 1 and 7; 3 and 8; a small trailing "o"
  is a zero. Look at how the same writer forms that digit elsewhere on the page before deciding.
- Some crews normally request matched quantities. These are hints for where to look twice, never a reason to
  alter a reading: on MIBS forms the bolt and nut lines of a pair usually match; on PANELS forms the same;
  on TORQUE & ALIGN forms the three bolt lengths usually add up to the hardware kit line, the lower bracket
  is usually twice the kit and the end caps usually equal the kit. If your reading breaks one of these,
  re-read the digits, keep what is written, lower the confidence and say so in note.

Confidence
- "high": you would be surprised to be wrong.
- "medium": a plausible alternative exists.
- "low": you are choosing between readings, or the field is partly illegible.
- For anything below high, write the alternative in note, like "Reads 7,926; could be 7,924."
- Form-level confidence covers the header fields. Use the form flags "pb_uncertain", "date_uncertain",
  "requester_uncertain" to say which header field is in doubt, and "pb_text" when PB Locations is words
  rather than a number.

If the page is not a Material Field Requisition, set is_requisition_form to false, return an empty lines
array, set every nullable form field to null, approval_signature_present false, confidence "low", and
describe the page in notes.`;

export const USER_TEXT = `Extract this page. Image 1 is the whole page. Image 2 is an enlarged crop of its upper right area.`;

/** One crew per paragraph: code, printed name, then each pre-printed part and its field description. */
export function crewsBlock(lookups: Lookups): string {
  return lookups.crews
    .map((c) =>
      [`${c.code} - printed "${c.name}"`, ...c.parts.map((p) => `  ${p.partNumber}  ${p.label}`)].join('\n'),
    )
    .join('\n\n');
}

/** Active people marked as requesters, one name per line. */
export function requestersBlock(lookups: Lookups): string {
  return lookups.people
    .filter((p) => p.isActive && p.isRequester)
    .map((p) => p.fullName)
    .join('\n');
}

export function buildSystemPrompt(lookups: Lookups): string {
  return SYSTEM_PROMPT_TEMPLATE.replace('{{CREWS_BLOCK}}', () => crewsBlock(lookups)).replace(
    '{{REQUESTERS_BLOCK}}',
    () => requestersBlock(lookups),
  );
}

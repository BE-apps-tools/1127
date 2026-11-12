import { describe, it, expect } from 'vitest';
import {
  addLine,
  emptyForCrew,
  fromDraft,
  removeLine,
  setAsWritten,
  setEach,
  setPart,
  toInput,
  toggleAll,
  warnings,
  type FormState,
} from '@/components/verify/form-state';
import { normalizeExtraction } from '@/domain/normalize';
import { ExtractionResultSchema } from '@/domain/extraction';
import fixture from '../fixtures/extraction/B-001.json';
import { lookupsFromMaster } from '../helpers/lookups';

const lookups = lookupsFromMaster();
const crew = (code: string) => lookups.crews.find((c) => c.code === code)!;

function blankFor(code: string, rows: Array<[string, string]>): FormState {
  let s = emptyForCrew(crew(code), lookups);
  s = { ...s, pbLocationRaw: '55', requestDate: '2026-11-10' };
  rows.forEach(([pn, text], i) => {
    s = setAsWritten(s, i, text, lookups);
    expect(s.lines[i].partText).toBe(pn);
  });
  return s;
}

describe('form-state', () => {
  it('emptyForCrew for TORQUE_ALIGN gives six rows in crew order with the default requester', () => {
    const s = emptyForCrew(crew('TORQUE_ALIGN'), lookups);
    expect(s.crewId).toBe(crew('TORQUE_ALIGN').id);
    expect(s.lines.map((l) => l.partText)).toEqual(['60811-090', '60811-100', '60811-105', '25233-00', '30836-000', '60780-000']);
    const justin = lookups.people.find((p) => p.fullName === 'Justin Herring')!;
    expect(s.requesterId).toBe(justin.id);
    expect(s.requesterNameRaw).toBe('Justin Herring');
    expect(s.lines.every((l) => l.partId != null && l.qtyRaw === '')).toBe(true);
  });

  it('setAsWritten fills each-count, pack quantity and pack unit from the part pack size', () => {
    let s = emptyForCrew(crew('TUBES'), lookups);
    s = setAsWritten(s, 0, '2 Pallets', lookups);
    expect(s.lines[0].partText).toBe('25244-000');
    expect(s.lines[0].qtyRequested).toBe(7680);
    expect(s.lines[0].eachText).toBe('7680');
    expect(s.lines[0].packQty).toBe(2);
    expect(s.lines[0].packUnit).toBe('pallet');
  });

  it('after a hand edit of Each, setAsWritten no longer overwrites it', () => {
    let s = emptyForCrew(crew('TUBES'), lookups);
    s = setAsWritten(s, 0, '2 Pallets', lookups);
    s = setEach(s, 0, '7000');
    s = setAsWritten(s, 0, '3 Pallets', lookups);
    expect(s.lines[0].qtyRaw).toBe('3 Pallets');
    expect(s.lines[0].qtyRequested).toBe(7000);
    // Clearing Each hands control back to the parser.
    s = setEach(s, 0, '');
    s = setAsWritten(s, 0, '3 Pallets', lookups);
    expect(s.lines[0].qtyRequested).toBe(11520);
  });

  it('setPart resolves an alias and keeps unmatched text', () => {
    let s = emptyForCrew(crew('MISC'), lookups);
    s = addLine(s);
    const i = s.lines.length - 1;
    s = setPart(s, i, '60825', lookups);
    expect(s.lines[i].partId).toBe(lookups.parts.find((p) => p.partNumber === '60825-300')!.id);
    s = setPart(s, i, '99999-000', lookups);
    expect(s.lines[i].partId).toBeNull();
    expect(s.lines[i].partText).toBe('99999-000');
    expect(s.lines[i].flags).toContain('part_unresolved');
  });

  it('choosing a part with a pack size re-parses a pack-only quantity', () => {
    let s = addLine(emptyForCrew(crew('MISC'), lookups));
    const i = s.lines.length - 1;
    s = setAsWritten(s, i, '3 Boxes', lookups);
    expect(s.lines[i].qtyRequested).toBeNull();
    s = setPart(s, i, '60825-300', lookups);
    expect(s.lines[i].qtyRequested).toBe(1395);
  });

  it('toInput drops rows with no quantity and keeps line order', () => {
    let s = emptyForCrew(crew('MIBS'), lookups);
    s = { ...s, pbLocationRaw: ' 73 ', requestDate: '2026-11-10' };
    s = setAsWritten(s, 3, '40 bolts', lookups);
    s = setAsWritten(s, 1, '30 bolts', lookups);
    const input = toInput(s, false);
    expect(input.pbLocationRaw).toBe('73');
    expect(input.lines.map((l) => l.partNumberRaw)).toEqual(['60852-000', '60964-000']);
    expect(input.lines.map((l) => l.qtyRequested)).toEqual([30, 40]);
    expect(input.duplicateAcknowledged).toBe(false);
    expect(toInput(s, true).duplicateAcknowledged).toBe(true);
  });

  it('warnings returns the sum warning for 170, 52, 4, 222, 444, 222 and nothing once 170 becomes 166', () => {
    let s = blankFor('TORQUE_ALIGN', [
      ['60811-090', '170'], ['60811-100', '52'], ['60811-105', '4'], ['25233-00', '222'], ['30836-000', '444'], ['60780-000', '222'],
    ]);
    const w = warnings(s, lookups);
    expect(w).toHaveLength(1);
    expect(w[0].type).toBe('sum');
    s = setAsWritten(s, 0, '166', lookups);
    expect(warnings(s, lookups)).toEqual([]);
  });

  it('toggleAll(true) leaves rows with no each-count unticked', () => {
    let s = emptyForCrew(crew('MIBS'), lookups);
    s = setAsWritten(s, 0, '10', lookups);
    s = setAsWritten(s, 1, "100's", lookups);
    s = toggleAll(s, true);
    expect(s.lines.map((l) => l.sisInitialed)).toEqual([true, false, false, false]);
    s = toggleAll(s, false);
    expect(s.lines.every((l) => !l.sisInitialed)).toBe(true);
  });

  it('fromDraft carries the AI reading into form state and round-trips through toInput', () => {
    const draft = normalizeExtraction(ExtractionResultSchema.parse(structuredClone(fixture)), lookups, '2026-11-12');
    const s = fromDraft(draft, lookups);
    expect(s.lines).toHaveLength(2);
    expect(s.lines[0].partText).toBe('25056-001');
    expect(s.lines[0].eachText).toBe('596');
    const input = toInput(s, false);
    expect(input.requestDate).toBe('2026-11-02');
    expect(input.lines.map((l) => [l.qtyRequested, l.sisInitialed, l.dateRequired])).toEqual([
      [596, true, '2026-11-03'],
      [149, true, '2026-11-03'],
    ]);
  });

  it('removeLine removes by index', () => {
    const s = removeLine(emptyForCrew(crew('MIBS'), lookups), 0);
    expect(s.lines).toHaveLength(3);
  });
});

import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/extraction/B-001.json';
import { ExtractionResultSchema, type ExtractionResult } from '@/domain/extraction';
import { inferRequestDate, normalizeExtraction } from '@/domain/normalize';
import { lookupsFromMaster } from '../helpers/lookups';

const lookups = lookupsFromMaster();
const TODAY = '2026-11-12';
const base = (): ExtractionResult => ExtractionResultSchema.parse(structuredClone(fixture));
const partId = (pn: string) => lookups.parts.find((p) => p.partNumber === pn)!.id;

function withLines(crew: string, rows: Array<[string, string, number | null]>): ExtractionResult {
  const x = base();
  x.form.crew_code = crew;
  x.lines = rows.map(([pn, qtyRaw, qtyEach], i) => ({
    line_no: i + 1,
    part_number_raw: pn,
    description_raw: null,
    is_write_in: false,
    qty_raw: qtyRaw,
    qty_each: qtyEach,
    date_required_raw: null,
    sis_initialed: true,
    confidence: 'high',
    flags: [],
    note: null,
  }));
  return x;
}

describe('inferRequestDate', () => {
  it.each([
    ['9-8', '2026-11-12', '2026-09-08'],
    ['12-28', '2027-01-05', '2026-12-28'],
    ['1-3', '2026-12-30', '2027-01-03'],
    ['9-8-26', '2030-01-01', '2026-09-08'],
    ['soon', '2026-11-12', null],
  ])('%s with today %s gives %s', (raw, today, expected) => {
    expect(inferRequestDate(raw, today)).toBe(expected);
  });
});

describe('normalizeExtraction', () => {
  it('normalizes the B-001 fixture', () => {
    const d = normalizeExtraction(base(), lookups, TODAY);
    const stage = lookups.crews.find((c) => c.code === 'STAGE_PREP')!;
    const erick = lookups.people.find((p) => p.fullName === 'Erick Hernandez')!;
    expect(d.form.crewId).toBe(stage.id);
    expect(d.form.requesterId).toBe(erick.id);
    expect(d.form.requesterNameRaw).toBe('Erick Hernandez');
    expect(d.form.requestDate).toBe('2026-11-02');
    expect(d.form.pbLocationRaw).toBe('103');
    expect(d.lines).toHaveLength(2);
    expect(d.lines[0].partId).toBe(partId('25056-001'));
    expect(d.lines[1].partId).toBe(partId('20-0070-07'));
    expect(d.lines.map((l) => l.qtyRequested)).toEqual([596, 149]);
    expect(d.lines.map((l) => l.dateRequired)).toEqual(['2026-11-03', '2026-11-03']);
    expect(d.lines.every((l) => l.sisInitialed)).toBe(true);
    expect(d.warnings).toEqual([]);
  });

  it('resolves a short number by alias and keeps the write-in mark', () => {
    const x = withLines('MIBS', [['60825', '10 ea', 10]]);
    x.lines[0].is_write_in = true;
    const d = normalizeExtraction(x, lookups, TODAY);
    expect(d.lines[0].partId).toBe(partId('60825-300'));
    expect(d.lines[0].isWriteIn).toBe(true);
  });

  it('turns boxes into an each-count using the part pack size', () => {
    const x = withLines('MIBS', [['60825-300', '3 Boxes', 1395]]);
    const d = normalizeExtraction(x, lookups, TODAY);
    expect(d.lines[0].qtyRequested).toBe(1395);
    expect(d.lines[0].packQty).toBe(3);
    expect(d.lines[0].packUnit).toBe('box');
    expect(d.lines[0].flags).not.toContain('parse_mismatch');
  });

  it('flags a model/parser disagreement and caps confidence at medium', () => {
    const x = withLines('STAGE_PREP', [['25056-001', '596 bolts', 569]]);
    const d = normalizeExtraction(x, lookups, TODAY);
    expect(d.lines[0].flags).toContain('parse_mismatch');
    expect(d.lines[0].confidence).toBe('medium');
    expect(d.lines[0].qtyRequested).toBe(596);
  });

  it('applies the default need-by date to lines without their own', () => {
    const x = withLines('STAGE_PREP', [
      ['25056-001', '10', 10],
      ['20-0070-07', '20', 20],
    ]);
    x.form.date_required_default_raw = '9/25/26';
    const d = normalizeExtraction(x, lookups, TODAY);
    expect(d.lines.map((l) => l.dateRequired)).toEqual(['2026-09-25', '2026-09-25']);
  });

  it('gives crewId null and no warnings for an unknown crew', () => {
    const x = withLines('NOPE', [['60811-090', '170', 170]]);
    const d = normalizeExtraction(x, lookups, TODAY);
    expect(d.form.crewId).toBeNull();
    expect(d.warnings).toEqual([]);
  });

  it('raises one sum warning for a Torque & Align form that does not add up', () => {
    const x = withLines('TORQUE_ALIGN', [
      ['60811-090', '170', 170],
      ['60811-100', '52', 52],
      ['60811-105', '4', 4],
      ['25233-00', '222', 222],
      ['30836-000', '444', 444],
      ['60780-000', '222', 222],
    ]);
    const d = normalizeExtraction(x, lookups, TODAY);
    expect(d.warnings).toHaveLength(1);
    expect(d.warnings[0].type).toBe('sum');
  });

  it('leaves an unreadable part number unresolved and flags it', () => {
    const x = withLines('MISC', [['251025143?', '5', 5]]);
    const d = normalizeExtraction(x, lookups, TODAY);
    expect(d.lines[0].partId).toBeNull();
    expect(d.lines[0].flags).toContain('part_unresolved');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDate, parsePb, parseQty } from '../../src/domain/parse';

const root = join(__dirname, '..', '..');
const vectors = JSON.parse(readFileSync(join(root, 'seed', 'parse_vectors.json'), 'utf8'));
const master = JSON.parse(readFileSync(join(root, 'seed', 'master.json'), 'utf8'));
const packOf = (pn: string | null) => {
  const p = master.parts.find((x: any) => x.part_number === pn);
  return p ? { eachPerBox: p.each_per_box, eachPerPallet: p.each_per_pallet } : null;
};

describe('parseQty against every quantity written on the 148 scanned forms', () => {
  it(`matches all ${vectors.qty.length} vectors`, () => {
    for (const v of vectors.qty) {
      const got = parseQty(v.raw, packOf(v.part_number));
      expect(got, v.raw).not.toBeNull();
      expect({ raw: v.raw, ...got }).toEqual({
        raw: v.raw,
        qtyEach: v.qty_each,
        packQty: v.pack_qty,
        packUnit: v.pack_unit,
        unitWord: v.unit_word,
        flags: v.flags,
      });
    }
  });
  it('treats blanks and dashes as no line', () => {
    for (const raw of [null, undefined, '', '   ', '-', '\u2014', '\u2013', '__']) expect(parseQty(raw)).toBeNull();
  });
  it('handles the shapes seen on the forms', () => {
    expect(parseQty('596 bolts')).toMatchObject({ qtyEach: 596, unitWord: 'bolts' });
    expect(parseQty('5, 604 bolts')).toMatchObject({ qtyEach: 5604 });
    expect(parseQty('4000 ea.')).toMatchObject({ qtyEach: 4000, unitWord: 'ea' });
    expect(parseQty('1 Pallet/3840')).toMatchObject({ qtyEach: 3840, packQty: 1, packUnit: 'pallet' });
    expect(parseQty('2 Pallets / 7,680')).toMatchObject({ qtyEach: 7680, packQty: 2, packUnit: 'pallet' });
    expect(parseQty('2 Boxes/930')).toMatchObject({ qtyEach: 930, packQty: 2, packUnit: 'box' });
    expect(parseQty('3 Boxes', { eachPerBox: 465, eachPerPallet: null })).toMatchObject({ qtyEach: 1395, packQty: 3 });
    expect(parseQty('3 Boxes')).toMatchObject({ qtyEach: null, packQty: 3, flags: ['pack_only'] });
    expect(parseQty("100's")).toMatchObject({ qtyEach: null, flags: ['ambiguous_qty'] });
    expect(parseQty('about a dozen')).toMatchObject({ qtyEach: null, flags: ['unparsed'] });
  });
});

describe('parseDate', () => {
  it(`matches all ${vectors.date.length} vectors`, () => {
    for (const v of vectors.date) {
      expect(parseDate(v.raw, { defaultYear: 2026, anchor: v.anchor }), `${v.raw} @ ${v.anchor}`).toBe(v.expected);
    }
  });
  it('infers the year and rolls over New Year', () => {
    expect(parseDate('9-8', { defaultYear: 2026 })).toBe('2026-09-08');
    expect(parseDate('09-14-2026', { defaultYear: 2020 })).toBe('2026-09-14');
    expect(parseDate('1/3', { defaultYear: 2026, anchor: '2026-12-29' })).toBe('2027-01-03');
    expect(parseDate('12/30', { defaultYear: 2026, anchor: '2026-12-29' })).toBe('2026-12-30');
    expect(parseDate('13-45', { defaultYear: 2026 })).toBeNull();
    expect(parseDate('soon', { defaultYear: 2026 })).toBeNull();
    expect(parseDate('', { defaultYear: 2026 })).toBeNull();
  });
});

describe('parsePb', () => {
  it(`matches all ${vectors.pb.length} vectors`, () => {
    for (const v of vectors.pb) {
      expect(parsePb(v.raw), v.raw).toEqual({ pbLocation: v.pb_location, pbNumber: v.pb_number });
    }
  });
  it('strips a PB prefix and keeps free text', () => {
    expect(parsePb('PB 55')).toEqual({ pbLocation: '55', pbNumber: 55 });
    expect(parsePb('pb.091')).toEqual({ pbLocation: '91', pbNumber: 91 });
    expect(parsePb('FOR LDYs')).toEqual({ pbLocation: 'FOR LDYs', pbNumber: null });
    expect(parsePb('12, 13')).toEqual({ pbLocation: '12, 13', pbNumber: null });
    expect(parsePb(null)).toEqual({ pbLocation: '', pbNumber: null });
  });
});

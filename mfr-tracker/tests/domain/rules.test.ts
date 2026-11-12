import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fingerprint, issuedQty, resolvePart, runCrewChecks } from '../../src/domain/rules';

const root = join(__dirname, '..', '..');
const seed = JSON.parse(readFileSync(join(root, 'seed', 'seed.json'), 'utf8'));
const master = JSON.parse(readFileSync(join(root, 'seed', 'master.json'), 'utf8'));
const stats = JSON.parse(readFileSync(join(root, 'seed', 'seed_stats.json'), 'utf8'));
const forms = seed.pages.filter((p: any) => p.form);

describe('issuedQty', () => {
  it('issues the full requested quantity only when initialed', () => {
    expect(issuedQty(true, 596)).toBe(596);
    expect(issuedQty(false, 596)).toBe(0);
    expect(issuedQty(true, null)).toBe(0);
  });
  it('reproduces the seed totals', () => {
    let requested = 0;
    let issued = 0;
    for (const p of forms)
      for (const l of p.lines) {
        requested += l.qty_each ?? 0;
        issued += issuedQty(l.sis_initialed, l.qty_each);
      }
    expect(requested).toBe(stats.grand_qty_requested);
    expect(issued).toBe(stats.grand_qty_issued);
  });
});

describe('fingerprint', () => {
  const fp = (p: any) =>
    fingerprint({
      crewCode: p.form.crew_code,
      pbLocation: p.form.pb_location,
      requestDate: p.form.request_date,
      lines: p.lines.map((l: any) => ({
        partNumber: l.part_number,
        partNumberRaw: l.part_number_raw,
        qtyEach: l.qty_each,
        qtyRaw: l.qty_raw,
      })),
    });
  it('is unique across the 140 non-duplicate seed requisitions', () => {
    expect(new Set(forms.map(fp)).size).toBe(stats.requisitions);
  });
  it('ignores line order and PB letter case', () => {
    const p = forms.find((x: any) => x.lines.length >= 3);
    const reversed = { ...p, form: { ...p.form, pb_location: p.form.pb_location.toLowerCase() }, lines: [...p.lines].reverse() };
    expect(fp(reversed)).toBe(fp(p));
  });
  it('changes when a quantity changes', () => {
    const p = forms[1];
    const changed = { ...p, lines: p.lines.map((l: any, i: number) => (i === 0 ? { ...l, qty_each: l.qty_each + 1 } : l)) };
    expect(fp(changed)).not.toBe(fp(p));
  });
});

describe('resolvePart', () => {
  const parts = master.parts.map((p: any, i: number) => ({ id: i + 1, partNumber: p.part_number }));
  const idOf = (pn: string) => parts.find((p: any) => p.partNumber === pn).id;
  const aliases = master.part_aliases.map((a: any) => ({ alias: a.alias, partId: idOf(a.part_number) }));
  it('matches exact, alias, then unique prefix', () => {
    expect(resolvePart(' 25056-001 ', parts, aliases)).toEqual({ partId: idOf('25056-001'), matchedBy: 'exact' });
    expect(resolvePart('60825', parts, aliases)).toEqual({ partId: idOf('60825-300'), matchedBy: 'alias' });
    expect(resolvePart('60963', parts, aliases)).toEqual({ partId: idOf('60963-300'), matchedBy: 'prefix' });
  });
  it('refuses ambiguous or unknown input', () => {
    expect(resolvePart('60811', parts, aliases).partId).toBeNull(); // three bolt lengths share this prefix
    expect(resolvePart('2523', parts, aliases).partId).toBeNull(); // too short
    expect(resolvePart('251025143?', parts, aliases).partId).toBeNull();
    expect(resolvePart('', parts, aliases).partId).toBeNull();
  });
});

describe('runCrewChecks', () => {
  const checksOf = (code: string) => master.crews.find((c: any) => c.code === code).checks;
  const linesOf = (p: any) => p.lines.map((l: any) => ({ partNumber: l.part_number, qtyEach: l.qty_each, isWriteIn: l.is_write_in }));
  it('flags exactly the three inconsistent forms in the seed', () => {
    const flagged = forms.filter((p: any) => runCrewChecks(checksOf(p.form.crew_code), linesOf(p)).length > 0).map((p: any) => p.page_key);
    expect(flagged).toEqual(['A-073', 'A-082', 'A-141']);
  });
  it('explains each kind of warning', () => {
    const ta = checksOf('TORQUE_ALIGN');
    const w = runCrewChecks(ta, [
      { partNumber: '60811-090', qtyEach: 170 },
      { partNumber: '60811-100', qtyEach: 52 },
      { partNumber: '60811-105', qtyEach: 4 },
      { partNumber: '25233-00', qtyEach: 222 },
      { partNumber: '30836-000', qtyEach: 440 },
      { partNumber: '60780-000', qtyEach: 220 },
    ]);
    expect(w.map((x) => x.type).sort()).toEqual(['equal', 'ratio', 'sum']);
  });
  it('skips checks it cannot evaluate', () => {
    const ta = checksOf('TORQUE_ALIGN');
    expect(runCrewChecks(ta, [{ partNumber: '60811-090', qtyEach: 62 }, { partNumber: '60811-100', qtyEach: 142 }])).toEqual([]);
    expect(
      runCrewChecks(ta, [
        { partNumber: '60811-100', qtyEach: null },
        { partNumber: '25233-00', qtyEach: 220 },
        { partNumber: '30836-000', qtyEach: 440 },
        { partNumber: '60780-000', qtyEach: 220 },
      ]),
    ).toEqual([]);
  });
});

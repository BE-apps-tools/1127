import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/extraction/B-001.json';
import { ExtractionResultSchema } from '@/domain/extraction';

describe('ExtractionResultSchema', () => {
  it('parses the B-001 fixture', () => {
    const r = ExtractionResultSchema.parse(fixture);
    expect(r.lines).toHaveLength(2);
    expect(r.form.crew_code).toBe('STAGE_PREP');
  });

  it('fails when lines is missing', () => {
    const rest: Record<string, unknown> = { ...fixture };
    delete rest.lines;
    expect(ExtractionResultSchema.safeParse(rest).success).toBe(false);
  });

  it('drops unknown flag strings instead of rejecting', () => {
    const x = structuredClone(fixture) as unknown as { form: { flags: string[] }; lines: Array<{ flags: string[] }> };
    x.form.flags = ['pb_uncertain', 'made_up_flag'];
    x.lines[0].flags = ['write_in', 'nonsense'];
    const r = ExtractionResultSchema.parse(x);
    expect(r.form.flags).toEqual(['pb_uncertain']);
    expect(r.lines[0].flags).toEqual(['write_in']);
  });

  it('rejects qty_each given as a string', () => {
    const x = structuredClone(fixture) as unknown as { lines: Array<{ qty_each: unknown }> };
    x.lines[0].qty_each = '596';
    expect(ExtractionResultSchema.safeParse(x).success).toBe(false);
  });
});

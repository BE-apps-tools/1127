import { describe, it, expect, beforeAll } from 'vitest';
import type { Lookups } from '@/domain/normalize';
import { buildSystemPrompt } from '@/server/ai/prompt';
import { getLookups } from '@/server/services/lookups';
import { seededDb } from '../helpers/db';

let lookups: Lookups;
beforeAll(async () => {
  lookups = await getLookups(await seededDb());
});

describe('buildSystemPrompt', () => {
  it('fills the crews and requesters blocks and leaves no placeholders', () => {
    const p = buildSystemPrompt(lookups);
    expect(p).toContain('STAGE_PREP - printed "STAGE & PREP"');
    expect(p).toContain('  25056-001  CENTER STRUCTURE TO BRACKET HARDWARE');
    for (const person of lookups.people.filter((x) => x.isActive && x.isRequester)) {
      expect(p).toContain(person.fullName);
    }
    expect(p).not.toContain('{{');
  });

  it('lists crews in sort order and omits inactive requesters', () => {
    const copy: Lookups = structuredClone(lookups);
    copy.people[0].isActive = false;
    const p = buildSystemPrompt(copy);
    expect(p).not.toContain(copy.people[0].fullName);
    expect(p.indexOf('MISC - printed')).toBeGreaterThan(-1);
    expect(p.indexOf(lookups.crews[0].code + ' - printed')).toBeLessThan(p.indexOf(lookups.crews[1].code + ' - printed'));
  });
});

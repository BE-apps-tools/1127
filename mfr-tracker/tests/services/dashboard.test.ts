import { describe, it, expect } from 'vitest';
import { getDashboard } from '@/server/services/dashboard';
import { seededDb } from '../helpers/db';

describe('dashboard service', () => {
  it('reports the seeded tile counts', async () => {
    const db = await seededDb();
    const d = await getDashboard(db);
    expect(d.pagesToVerify).toBe(0);
    expect(d.pagesFailed).toBe(0);
    expect(d.backlogUnverified).toBe(140);
    expect(d.flaggedReads).toBe(38);
    expect(d.linesPending).toBe(58);
    expect(d.partsToConfirm).toBe(5);
    expect(d.linesUnresolved).toBe(1);
    expect(d.repeatIssues).toBe(13);
    expect(d.recent).toHaveLength(10);
    expect(d.recent[0].reqNumber).toBe('MFR-000140');
  });
});

import { describe, it, expect } from 'vitest';
import { RequisitionInputSchema, type RequisitionInput } from '@/domain/requisition-input';

function valid(): RequisitionInput {
  return {
    crewId: 1,
    requesterId: 2,
    requesterNameRaw: 'Erick Hernandez',
    pbLocationRaw: '103',
    requestDate: '2026-11-02',
    approverId: null,
    approvalSignaturePresent: true,
    notes: null,
    confidence: 'high',
    flags: [],
    duplicateAcknowledged: false,
    lines: [
      {
        partId: 2,
        partNumberRaw: '25056-001',
        descriptionRaw: null,
        isWriteIn: false,
        qtyRaw: '596 bolts',
        qtyRequested: 596,
        packQty: null,
        packUnit: null,
        unitWord: 'bolts',
        dateRequired: '2026-11-03',
        sisInitialed: true,
        confidence: 'high',
        flags: [],
        note: null,
      },
    ],
  };
}

describe('RequisitionInputSchema', () => {
  it('accepts valid input', () => {
    expect(RequisitionInputSchema.safeParse(valid()).success).toBe(true);
  });

  it('rejects zero lines', () => {
    const x = valid();
    x.lines = [];
    expect(RequisitionInputSchema.safeParse(x).success).toBe(false);
  });

  it('rejects a line with neither partId nor partNumberRaw', () => {
    const x = valid();
    x.lines[0].partId = null;
    x.lines[0].partNumberRaw = '  ';
    expect(RequisitionInputSchema.safeParse(x).success).toBe(false);
  });

  it('rejects an initialed line without an each-count, with the contract message', () => {
    const x = valid();
    x.lines[0].qtyRequested = null;
    const r = RequisitionInputSchema.safeParse(x);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message)).toContain('Enter a quantity before marking a line as issued.');
    }
  });

  it('rejects a line with neither qtyRaw nor qtyRequested', () => {
    const x = valid();
    x.lines[0].qtyRaw = null;
    x.lines[0].qtyRequested = null;
    x.lines[0].sisInitialed = false;
    expect(RequisitionInputSchema.safeParse(x).success).toBe(false);
  });

  it('rejects a blank pbLocationRaw', () => {
    const x = valid();
    x.pbLocationRaw = '   ';
    expect(RequisitionInputSchema.safeParse(x).success).toBe(false);
  });
});

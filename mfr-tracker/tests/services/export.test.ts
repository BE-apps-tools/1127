import { describe, it, expect, beforeAll } from 'vitest';
import ExcelJS from 'exceljs';
import type { Db } from '@/server/db/types';
import { exportTracker, parseTrackerFilters } from '@/server/services/tracker';
import { EXPORT_HEADERS, exportFileName, toCsv, toXlsx } from '@/server/services/export';
import { seededDb } from '../helpers/db';

const HEADER =
  'Req #,Request Date,Crew,Requester,PB,Line,Part #,Part Name,Part As Written,Qty As Written,Qty Requested,Qty Issued,Pack Qty,Pack Unit,Date Required,Issue Status,Verified,Confidence,Flags,Notes,Source,Scan Page';

let db: Db;
let rows: Awaited<ReturnType<typeof exportTracker>>;
beforeAll(async () => {
  db = await seededDb();
  rows = await exportTracker(db, parseTrackerFilters(new URLSearchParams()));
});

describe('export', () => {
  it('has the contract header', () => {
    expect(EXPORT_HEADERS.join(',')).toBe(HEADER);
  });

  it('CSV starts with a BOM, uses CRLF and has 425 lines for the unfiltered seed', () => {
    const csv = toCsv(rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')[0]).toBe(HEADER);
    expect(csv.split('\r\n').filter((l) => l !== '')).toHaveLength(425);
    expect(csv).not.toMatch(/[^\r]\n/);
  });

  it('quotes fields containing commas, quotes or line breaks', () => {
    const r = { ...rows[0], formNotes: 'has, comma and "quote"', lineNote: null };
    const csv = toCsv([r]);
    expect(csv).toContain('"has, comma and ""quote"""');
  });

  it('combines confidence, flags and notes as specified', () => {
    const r = { ...rows[0], lineConfidence: 'high' as const, formConfidence: 'low' as const, lineFlags: ['a'], formFlags: ['b', 'a'], lineNote: 'line', formNotes: 'form' };
    const [, first] = toCsv([r]).slice(1).split('\r\n');
    expect(first).toContain(',low,a; b,line | form,');
  });

  it('XLSX has sheet Tracker, 425 rows, a bold header, numeric quantities and date cells', async () => {
    const buf = await toXlsx(rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Tracker')!;
    expect(ws.rowCount).toBe(425);
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.getRow(1).getCell(11).value).toBe('Qty Requested');
    const idx = (name: string) => EXPORT_HEADERS.indexOf(name) + 1;
    const sample = ws.getRow(2);
    expect(typeof sample.getCell(idx('Qty Requested')).value).toBe('number');
    expect(sample.getCell(idx('Request Date')).value).toBeInstanceOf(Date);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
  });

  it('builds file names from the clock', () => {
    const d = new Date(2026, 10, 12, 9, 5);
    expect(exportFileName('tracker', 'csv', d)).toBe('mfr-tracker-20261112-0905.csv');
    expect(exportFileName('matrix', 'xlsx', d)).toBe('mfr-matrix-20261112-0905.xlsx');
  });
});

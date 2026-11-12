import type { TrackerRow } from './tracker';
import type { Matrix } from './matrix';
import { matrixCellKey } from './matrix';

export const EXPORT_HEADERS: readonly string[] = [
  'Req #', 'Request Date', 'Crew', 'Requester', 'PB', 'Line', 'Part #', 'Part Name', 'Part As Written', 'Qty As Written',
  'Qty Requested', 'Qty Issued', 'Pack Qty', 'Pack Unit', 'Date Required', 'Issue Status', 'Verified', 'Confidence', 'Flags',
  'Notes', 'Source', 'Scan Page',
];

const RANK = { high: 2, medium: 1, low: 0 } as const;

type Cell = string | number | Date | null;

function isoToDate(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** The 22 export columns of one row, in contract order. Dates stay ISO strings; the Excel writer converts them. */
function toValues(r: TrackerRow): Array<string | number | null> {
  const confidence = RANK[r.lineConfidence] <= RANK[r.formConfidence] ? r.lineConfidence : r.formConfidence;
  const flags = [...new Set([...r.lineFlags, ...r.formFlags])].join('; ');
  const notes = [r.lineNote, r.formNotes].filter((x): x is string => !!x && x.trim() !== '').join(' | ');
  return [
    r.reqNumber, r.requestDate, r.crewName, r.requester, r.pbLocation, r.lineNo, r.partNumber, r.partName, r.partNumberRaw,
    r.qtyRaw, r.qtyRequested, r.qtyIssued, r.packQty, r.packUnit, r.dateRequired, r.issueStatus, r.verified ? 'Yes' : 'No',
    confidence, flags, notes, r.source, r.scanPageId,
  ];
}

function csvField(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180, CRLF line ends, UTF-8 with a BOM. */
export function toCsv(rows: TrackerRow[]): string {
  const lines = [EXPORT_HEADERS.join(','), ...rows.map((r) => toValues(r).map(csvField).join(','))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

const DATE_COLUMNS = new Set(['Request Date', 'Date Required']);
const NUMBER_COLUMNS = new Set(['Qty Requested', 'Qty Issued', 'Pack Qty']);
const WIDTHS: Record<string, number> = {
  'Req #': 12, 'Request Date': 13, Crew: 16, Requester: 18, PB: 10, Line: 6, 'Part #': 14, 'Part Name': 34,
  'Part As Written': 16, 'Qty As Written': 16, 'Qty Requested': 14, 'Qty Issued': 12, 'Pack Qty': 9, 'Pack Unit': 9,
  'Date Required': 13, 'Issue Status': 12, Verified: 9, Confidence: 11, Flags: 22, Notes: 40, Source: 8, 'Scan Page': 10,
};

export async function toXlsx(rows: TrackerRow[]): Promise<Uint8Array> {
  // exceljs is loaded only here so it stays out of every other bundle.
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Tracker', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = EXPORT_HEADERS.map((h) => ({ header: h, key: h, width: WIDTHS[h] ?? 14 }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    const values = toValues(r);
    const cells: Cell[] = values.map((v, i) => (DATE_COLUMNS.has(EXPORT_HEADERS[i]) ? isoToDate(v as string | null) : v));
    ws.addRow(cells);
  }
  EXPORT_HEADERS.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    if (DATE_COLUMNS.has(h)) col.numFmt = 'yyyy-mm-dd';
    if (NUMBER_COLUMNS.has(h)) col.numFmt = '#,##0';
  });
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_HEADERS.length } };
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Matrix as a sheet: PB rows by part columns with row and column totals. */
export async function matrixToXlsx(m: Matrix): Promise<Uint8Array> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Matrix', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
  ws.addRow(['', ...m.columns.map((c) => c.crewCode ?? ''), '']);
  ws.addRow(['PB', ...m.columns.map((c) => c.partNumber), 'Total']);
  for (const r of m.rows) {
    ws.addRow([
      r.pbNumber ?? r.pbLocation,
      ...m.columns.map((c) => m.cells[matrixCellKey(r.pbLocation, c.partId)]?.qty ?? null),
      m.rowTotals[r.pbLocation] ?? 0,
    ]);
  }
  ws.addRow(['Total', ...m.columns.map((c) => m.columnTotals[c.partId] ?? 0), Object.values(m.rowTotals).reduce((a, b) => a + b, 0)]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(2).font = { bold: true };
  ws.getColumn(1).width = 12;
  for (let i = 2; i <= m.columns.length + 2; i++) {
    ws.getColumn(i).width = 13;
    ws.getColumn(i).numFmt = '#,##0';
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const pad = (n: number) => String(n).padStart(2, '0');

export function exportFileName(kind: 'tracker' | 'matrix', ext: 'csv' | 'xlsx', now: Date = new Date()): string {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `mfr-${kind}-${stamp}.${ext}`;
}

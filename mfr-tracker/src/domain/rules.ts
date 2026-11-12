// Business rules. PROVIDED AND TESTED. Server and client safe except fingerprint (node:crypto, server only).
import { createHash } from 'node:crypto';
import type { AliasRef, CheckLine, CheckWarning, CrewCheck, FingerprintLine, PartRef } from './types';

/** Issue rule (decided 2026-11-12): SIS/IA initials on a line mean the full Qty Needed left the yard. */
export function issuedQty(sisInitialed: boolean, qtyRequested: number | null): number {
  return sisInitialed ? (qtyRequested ?? 0) : 0;
}

/** Same crew + same PB + same request date + same set of part:qty pairs => same fingerprint => possible duplicate. */
export function fingerprint(input: {
  crewCode: string;
  pbLocation: string;
  requestDate: string;
  lines: FingerprintLine[];
}): string {
  const lineKeys = input.lines
    .map((l) => `${l.partNumber ?? `?${l.partNumberRaw ?? ''}`}:${l.qtyEach ?? `?${l.qtyRaw ?? ''}`}`)
    .sort()
    .join(',');
  const canonical = [input.crewCode, input.pbLocation.toUpperCase(), input.requestDate, lineKeys].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

/** Exact part number, then exact alias, then a unique prefix of at least 5 characters. Case and space insensitive. */
export function resolvePart(
  raw: string | null | undefined,
  parts: PartRef[],
  aliases: AliasRef[],
): { partId: number | null; matchedBy: 'exact' | 'alias' | 'prefix' | null } {
  const key = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!key) return { partId: null, matchedBy: null };
  const exact = parts.find((p) => p.partNumber.toUpperCase() === key);
  if (exact) return { partId: exact.id, matchedBy: 'exact' };
  const alias = aliases.find((a) => a.alias.trim().toUpperCase() === key);
  if (alias) return { partId: alias.partId, matchedBy: 'alias' };
  if (key.length >= 5) {
    const hits = parts.filter((p) => p.partNumber.toUpperCase().startsWith(key));
    if (hits.length === 1) return { partId: hits[0].id, matchedBy: 'prefix' };
  }
  return { partId: null, matchedBy: null };
}

/**
 * Soft consistency checks per crew. Warnings only, never block a save.
 * Write-in lines are ignored. A check is skipped when a part it needs has no countable quantity on the form,
 * except 'sum', where missing addends count as zero (a blank bolt row is normal).
 */
export function runCrewChecks(checks: CrewCheck[], lines: CheckLine[]): CheckWarning[] {
  const q = new Map<string, number | null>();
  for (const l of lines) {
    if (l.isWriteIn || !l.partNumber) continue;
    q.set(l.partNumber, l.qtyEach);
  }
  const has = (pn: string) => q.has(pn) && q.get(pn) != null;
  const val = (pn: string) => q.get(pn) as number;
  const out: CheckWarning[] = [];
  for (const c of checks) {
    if (c.type === 'equal') {
      const [a, b] = c.parts;
      if (has(a) && has(b) && val(a) !== val(b)) {
        out.push({ type: 'equal', partNumbers: [a, b], message: `${a} (${val(a)}) and ${b} (${val(b)}) are normally equal.` });
      }
    } else if (c.type === 'ratio') {
      if (has(c.part) && has(c.of) && val(c.part) !== c.factor * val(c.of)) {
        out.push({
          type: 'ratio',
          partNumbers: [c.part, c.of],
          message: `${c.part} (${val(c.part)}) is normally ${c.factor} x ${c.of} (${val(c.of)}).`,
        });
      }
    } else {
      if (!has(c.total)) continue;
      if (c.parts.some((pn) => q.has(pn) && q.get(pn) == null)) continue;
      const sum = c.parts.reduce((acc, pn) => acc + (has(pn) ? val(pn) : 0), 0);
      if (sum !== val(c.total)) {
        out.push({
          type: 'sum',
          partNumbers: [c.total, ...c.parts],
          message: `${c.parts.join(' + ')} add to ${sum}, but ${c.total} says ${val(c.total)}.`,
        });
      }
    }
  }
  return out;
}

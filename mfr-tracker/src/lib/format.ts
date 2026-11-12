/** Display helpers. Dates show as MM/DD/YYYY; quantities use thousands separators. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

export function fmtNum(n: number | null | undefined): string {
  return n == null ? '' : n.toLocaleString('en-US');
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

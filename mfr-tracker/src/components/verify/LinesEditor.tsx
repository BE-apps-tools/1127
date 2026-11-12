'use client';

import { Button } from '@/components/ui/Button';
import { CONTROL } from '@/components/ui/Input';
import type { Lookups } from '@/domain/normalize';
import { fmtNum } from '@/lib/format';
import { addLine, removeLine, setAsWritten, setDate, setEach, setInitialed, setPart, toggleAll, type FormState, type LineState } from './form-state';

const AMBER = 'border-amber-500 ring-1 ring-amber-400 bg-amber-50';

function isFlagged(l: LineState, highlight: boolean): boolean {
  return highlight && (l.confidence !== 'high' || l.flags.includes('parse_mismatch') || l.flags.includes('part_unresolved'));
}

export function LinesEditor({
  state,
  lookups,
  onChange,
  highlight,
  disabled,
}: {
  state: FormState;
  lookups: Lookups;
  onChange: (next: FormState) => void;
  highlight: boolean;
  disabled?: boolean;
}) {
  const anyChecked = state.lines.some((l) => l.sisInitialed);
  const allReady = state.lines.filter((l) => l.qtyRequested != null);
  const allChecked = allReady.length > 0 && allReady.every((l) => l.sisInitialed);
  const cell = 'px-1 py-1 align-top';

  return (
    <div className="space-y-2">
      <datalist id="parts-datalist">
        {lookups.parts
          .filter((p) => p.isActive)
          .map((p) => (
            <option key={p.id} value={p.partNumber}>
              {p.partNumber} - {p.label}
            </option>
          ))}
      </datalist>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Requisition lines</caption>
          <thead>
            <tr className="text-left text-xs text-stone-600">
              <th className={cell}>Part</th>
              <th className={cell}>As written</th>
              <th className={`${cell} text-right`}>Each</th>
              <th className={cell}>Pack</th>
              <th className={cell}>Need by</th>
              <th className={cell}>
                <span className="inline-flex items-center gap-1">
                  Issued
                  <input
                    type="checkbox"
                    aria-label="Mark all lines issued"
                    checked={allChecked}
                    disabled={disabled}
                    onChange={(e) => onChange(toggleAll(state, e.target.checked))}
                    className="h-4 w-4 accent-blue-700"
                  />
                </span>
              </th>
              <th className={cell}>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {state.lines.map((l, i) => {
              const flagged = isFlagged(l, highlight);
              const unresolved = l.partId == null && l.partText.trim() !== '';
              const label = (what: string) => `${what}, line ${i + 1}`;
              const part = lookups.parts.find((p) => p.id === l.partId);
              return (
                <tr key={l.key} className="border-t border-stone-200">
                  <td className={cell}>
                    <input
                      aria-label={label('Part number')}
                      list="parts-datalist"
                      value={l.partText}
                      disabled={disabled}
                      onChange={(e) => onChange(setPart(state, i, e.target.value, lookups))}
                      className={`${CONTROL} min-w-36 ${flagged || unresolved ? AMBER : ''}`}
                    />
                    <div className="mt-0.5 max-w-48 truncate text-xs text-stone-500" title={part?.label ?? l.descriptionRaw ?? ''}>
                      {part?.label ?? l.descriptionRaw ?? (unresolved ? 'No matching part' : '')}
                    </div>
                  </td>
                  <td className={cell}>
                    <input
                      aria-label={label('Quantity as written')}
                      value={l.qtyRaw}
                      disabled={disabled}
                      onChange={(e) => onChange(setAsWritten(state, i, e.target.value, lookups))}
                      className={`${CONTROL} min-w-28 ${flagged ? AMBER : ''}`}
                    />
                  </td>
                  <td className={cell}>
                    <input
                      aria-label={label('Each-count')}
                      inputMode="numeric"
                      value={l.eachText}
                      disabled={disabled}
                      onChange={(e) => onChange(setEach(state, i, e.target.value))}
                      className={`${CONTROL} w-24 text-right ${flagged ? AMBER : ''}`}
                    />
                    {l.qtyRequested != null ? <div className="text-right text-xs text-stone-500">{fmtNum(l.qtyRequested)}</div> : null}
                  </td>
                  <td className={`${cell} whitespace-nowrap text-xs text-stone-600`}>{l.packQty ? `${l.packQty} ${l.packUnit ?? ''}` : ''}</td>
                  <td className={cell}>
                    <input
                      type="date"
                      aria-label={label('Date required')}
                      value={l.dateRequired}
                      disabled={disabled}
                      onChange={(e) => onChange(setDate(state, i, e.target.value))}
                      className={`${CONTROL} w-36`}
                    />
                  </td>
                  <td className={cell}>
                    <input
                      type="checkbox"
                      aria-label={label('Issued')}
                      checked={l.sisInitialed}
                      disabled={disabled || l.qtyRequested == null}
                      onChange={(e) => onChange(setInitialed(state, i, e.target.checked))}
                      className="mt-2 h-4 w-4 accent-blue-700"
                    />
                  </td>
                  <td className={cell}>
                    {!disabled ? (
                      <Button size="sm" variant="ghost" aria-label={label('Remove line')} onClick={() => onChange(removeLine(state, i))}>
                        Remove
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {highlight ? (
        <ul className="space-y-0.5 text-xs text-amber-900">
          {state.lines.map((l, i) =>
            isFlagged(l, highlight) && (l.note || l.flags.length) ? (
              <li key={l.key}>
                Line {i + 1}: {l.note ?? ''}
                {l.flags.length ? ` (${l.flags.join(', ').replace(/_/g, ' ')})` : ''}
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
      {!disabled ? (
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => onChange(addLine(state))}>
            + Add line (Alt+N)
          </Button>
          {anyChecked ? null : <span className="text-xs text-stone-500">Tick Issued for each line that left the yard.</span>}
        </div>
      ) : null}
    </div>
  );
}

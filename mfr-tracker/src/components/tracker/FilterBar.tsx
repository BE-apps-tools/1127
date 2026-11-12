import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { CONTROL } from '@/components/ui/Input';
import type { Lookups } from '@/domain/normalize';
import type { TrackerFilters } from '@/server/services/tracker';

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-xs font-medium text-stone-700">
      {label}
      {children}
    </label>
  );
}

/** A plain GET form, so every filter lives in the URL and the page works without client JavaScript. */
export function FilterBar({ filters, lookups }: { filters: TrackerFilters; lookups: Lookups }) {
  const requesters = lookups.people.filter((p) => p.isRequester);
  return (
    <form method="get" action="/tracker" className="flex flex-wrap items-end gap-2 rounded border border-stone-300 bg-white p-2" aria-label="Tracker filters">
      <Labeled label="From">
        <input type="date" name="from" defaultValue={filters.from ?? ''} className={`${CONTROL} w-36`} />
      </Labeled>
      <Labeled label="To">
        <input type="date" name="to" defaultValue={filters.to ?? ''} className={`${CONTROL} w-36`} />
      </Labeled>
      <Labeled label="Crew">
        <select name="crew" defaultValue={filters.crew?.[0] ?? ''} className={`${CONTROL} w-40`}>
          <option value="">All crews</option>
          {lookups.crews.map((c) => (
            <option key={c.id} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="Requester">
        <select name="requester" defaultValue={filters.requesterId ?? ''} className={`${CONTROL} w-40`}>
          <option value="">Anyone</option>
          {requesters.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="PB (55, 81-90 or text)">
        <input name="pb" defaultValue={filters.pb ?? ''} className={`${CONTROL} w-32`} />
      </Labeled>
      <Labeled label="Part">
        <select name="part" defaultValue={filters.partId?.[0] ?? ''} className={`${CONTROL} w-44`}>
          <option value="">All parts</option>
          {lookups.parts
            .filter((p) => p.isActive)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.partNumber} - {p.label}
              </option>
            ))}
        </select>
      </Labeled>
      <Labeled label="Issue status">
        <select name="issue" defaultValue={filters.issue ?? ''} className={`${CONTROL} w-28`}>
          <option value="">Any</option>
          <option value="issued">Issued</option>
          <option value="pending">Pending</option>
        </select>
      </Labeled>
      <Labeled label="Verified">
        <select name="verified" defaultValue={filters.verified === undefined ? '' : filters.verified ? 'yes' : 'no'} className={`${CONTROL} w-24`}>
          <option value="">Any</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </Labeled>
      <Labeled label="Source">
        <select name="source" defaultValue={filters.source ?? ''} className={`${CONTROL} w-28`}>
          <option value="">Any</option>
          <option value="seed">Backlog</option>
          <option value="scan">Scan</option>
          <option value="manual">By hand</option>
        </select>
      </Labeled>
      <Labeled label="Search">
        <input type="search" name="q" defaultValue={filters.q ?? ''} placeholder="Req #, part, note" className={`${CONTROL} w-44`} />
      </Labeled>
      <div className="flex items-center gap-3 pb-1.5">
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="review" value="1" defaultChecked={filters.review} className="h-4 w-4 accent-blue-700" />
          Flagged
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="unresolved" value="1" defaultChecked={filters.unresolved} className="h-4 w-4 accent-blue-700" />
          No part match
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="void" value="1" defaultChecked={filters.includeVoid} className="h-4 w-4 accent-blue-700" />
          Include void
        </label>
      </div>
      <Labeled label="Sort">
        <select name="sort" defaultValue={filters.sort ?? 'date_desc'} className={`${CONTROL} w-32`}>
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="pb">PB</option>
          <option value="part">Part</option>
        </select>
      </Labeled>
      <div className="flex gap-2 pb-0.5">
        <Button type="submit" variant="primary">
          Apply
        </Button>
        <Link href="/tracker" className="inline-flex items-center rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100">
          Clear
        </Link>
      </div>
    </form>
  );
}

import Link from 'next/link';

export interface TabItem {
  label: string;
  href: string;
  count?: number;
  active: boolean;
}

/** Link-based tabs, so the active tab lives in the URL and works without client JavaScript. */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-1 border-b border-stone-300">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? 'page' : undefined}
          className={`-mb-px rounded-t border px-3 py-1.5 text-sm ${t.active ? 'border-stone-300 border-b-white bg-white font-semibold' : 'border-transparent text-stone-600 hover:text-stone-900'}`}
        >
          {t.label}
          {t.count !== undefined ? <span className="ml-1 text-xs text-stone-500">({t.count})</span> : null}
        </Link>
      ))}
    </nav>
  );
}

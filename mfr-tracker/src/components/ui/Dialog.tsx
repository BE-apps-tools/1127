'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** A modal on the native <dialog> element. Escape and the backdrop close it. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className="m-auto w-full max-w-lg rounded-md border border-stone-300 bg-white p-0 text-stone-900 shadow-xl"
    >
      {open ? (
        <div className="p-4">
          <h2 id="dialog-title" className="mb-3 text-base font-semibold">
            {title}
          </h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

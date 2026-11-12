'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { extractPageRequest, replacePageImage } from '@/components/scan/api';
import { rotateExistingImage } from '@/components/scan/canvas';

const MIN = 0.2;
const MAX = 8;

export function ImagePane({ pageId, canRotate }: { pageId: number; canRotate: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const box = useRef<HTMLDivElement>(null);
  const [variant, setVariant] = useState<'full' | 'detail'>('full');
  const [detailMissing, setDetailMissing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [version, setVersion] = useState(0);
  const [rotating, setRotating] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const fit = () => {
    setZoom(1);
    setPos({ x: 0, y: 0 });
  };

  // A wheel listener that is not passive, so the page does not scroll while zooming.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(MAX, Math.max(MIN, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  async function rotate() {
    setRotating(true);
    try {
      const res = await fetch(`/api/pages/${pageId}/image?variant=full&v=${version}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load the page image.');
      const imgs = await rotateExistingImage(await res.blob());
      await replacePageImage(pageId, imgs, { sha256: imgs.sha256, width: imgs.width, height: imgs.height, rotationApplied: 90, rotationConfident: true });
      const read = await extractPageRequest(pageId);
      setVersion((v) => v + 1);
      setDetailMissing(false);
      fit();
      if (read.status === 'failed') toast(`The page was rotated but reading failed: ${read.error ?? ''}`, 'error');
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not rotate the page.', 'error');
    }
    setRotating(false);
  }

  const src = `/api/pages/${pageId}/image?variant=${variant}&v=${version}`;
  return (
    <div className="flex h-full min-h-[480px] flex-col rounded border border-stone-300 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-stone-300 p-1.5">
        <Button size="sm" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(MIN, z / 1.25))}>
          -
        </Button>
        <Button size="sm" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(MAX, z * 1.25))}>
          +
        </Button>
        <Button size="sm" onClick={fit}>
          Fit
        </Button>
        {canRotate ? (
          <Button size="sm" disabled={rotating} onClick={() => void rotate()}>
            {rotating ? 'Rotating...' : 'Rotate 90°'}
          </Button>
        ) : null}
        <div className="ml-auto inline-flex overflow-hidden rounded border border-stone-300" role="group" aria-label="Image view">
          <button type="button" aria-pressed={variant === 'full'} onClick={() => { setVariant('full'); fit(); }} className={`px-2 py-1 text-xs ${variant === 'full' ? 'bg-blue-700 text-white' : 'bg-white'}`}>
            Whole
          </button>
          <button
            type="button"
            aria-pressed={variant === 'detail'}
            disabled={detailMissing}
            title={detailMissing ? 'No detail image for this page' : undefined}
            onClick={() => { setVariant('detail'); fit(); }}
            className={`px-2 py-1 text-xs disabled:opacity-40 ${variant === 'detail' ? 'bg-blue-700 text-white' : 'bg-white'}`}
          >
            Detail
          </button>
        </div>
      </div>
      <div
        ref={box}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden bg-stone-200 active:cursor-grabbing"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current) setPos({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={src}
          src={src}
          alt="Scanned requisition page"
          draggable={false}
          onError={() => {
            if (variant === 'detail') {
              setDetailMissing(true);
              setVariant('full');
            }
          }}
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`, transformOrigin: 'center center' }}
          className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain"
        />
      </div>
    </div>
  );
}

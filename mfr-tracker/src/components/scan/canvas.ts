// Browser canvas helpers for the scan pipeline (contract section 10). Client only.
import { detectRotation, type Rotation } from '@/domain/orientation';

export function newCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot draw images.');
  return ctx;
}

/** Rotates clockwise by 0, 90, 180 or 270 degrees. Returns the same canvas for 0. */
export function rotateCanvas(src: HTMLCanvasElement, degrees: Rotation): HTMLCanvasElement {
  if (degrees === 0) return src;
  const swap = degrees === 90 || degrees === 270;
  const out = newCanvas(swap ? src.height : src.width, swap ? src.width : src.height);
  const ctx = ctx2d(out);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/** Scales so the longer edge equals `longEdge` (up or down). */
export function scaleToLongEdge(src: HTMLCanvasElement, longEdge: number): HTMLCanvasElement {
  const k = longEdge / Math.max(src.width, src.height);
  const out = newCanvas(src.width * k, src.height * k);
  const ctx = ctx2d(out);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

/** Crops a region given as fractions of the source (0 to 1) and scales it to `outWidth`. */
export function cropRegion(src: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number, outWidth: number): HTMLCanvasElement {
  const sx = src.width * x0;
  const sy = src.height * y0;
  const sw = src.width * (x1 - x0);
  const sh = src.height * (y1 - y0);
  const out = newCanvas(outWidth, (outWidth * sh) / sw);
  const ctx = ctx2d(out);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

export function toJpegBlob(c: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), 'image/jpeg', quality);
  });
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface PageImages {
  full: Blob;
  detail: Blob;
  sha256: string;
  width: number;
  height: number;
}

/** From an upright canvas: the 1600 px page image, the detail crop of the upper right area, and the hash. */
export async function buildPageImages(upright: HTMLCanvasElement): Promise<PageImages> {
  const fullCanvas = scaleToLongEdge(upright, 1600);
  let full = await toJpegBlob(fullCanvas, 0.82);
  if (full.size > 1.8 * 1024 * 1024) full = await toJpegBlob(fullCanvas, 0.65);
  const detail = await toJpegBlob(cropRegion(upright, 0.4, 0, 1, 0.58, 1568), 0.85);
  return { full, detail, sha256: await sha256Hex(full), width: fullCanvas.width, height: fullCanvas.height };
}

/** Detects the rotation from a 440 px wide copy, rotates the page upright, and builds the upload images. */
export async function prepareScan(source: HTMLCanvasElement): Promise<PageImages & { rotationApplied: Rotation; rotationConfident: boolean }> {
  const small = newCanvas(440, (source.height * 440) / source.width);
  const smallCtx = ctx2d(small);
  smallCtx.imageSmoothingQuality = 'high';
  smallCtx.drawImage(source, 0, 0, small.width, small.height);
  const data = ctx2d(small).getImageData(0, 0, small.width, small.height);
  const { rotation, confident } = detectRotation(data.data, small.width, small.height);
  const upright = rotateCanvas(source, rotation);
  const images = await buildPageImages(scaleToLongEdge(upright, 2400));
  return { ...images, rotationApplied: rotation, rotationConfident: confident };
}

/** Rotates an existing 1600 px page image 90 degrees clockwise and rebuilds both images (verify screen). */
export async function rotateExistingImage(fullBlob: Blob): Promise<PageImages> {
  const bitmap = await createImageBitmap(fullBlob);
  const src = newCanvas(bitmap.width, bitmap.height);
  ctx2d(src).drawImage(bitmap, 0, 0);
  bitmap.close();
  return buildPageImages(rotateCanvas(src, 90));
}

// PDF rendering in the browser with pdfjs-dist, loaded on demand. Client only.
import { newCanvas } from './canvas';

type PdfDocument = import('pdfjs-dist').PDFDocumentProxy;

let workerReady = false;
const docs = new WeakMap<File, Promise<PdfDocument>>();

async function loadLib() {
  const pdfjs = await import('pdfjs-dist');
  if (!workerReady) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    workerReady = true;
  }
  return pdfjs;
}

export function openPdf(file: File): Promise<PdfDocument> {
  let p = docs.get(file);
  if (!p) {
    p = (async () => {
      const pdfjs = await loadLib();
      const data = new Uint8Array(await file.arrayBuffer());
      return pdfjs.getDocument({ data }).promise;
    })();
    docs.set(file, p);
  }
  return p;
}

export async function pdfPageCount(file: File): Promise<number> {
  return (await openPdf(file)).numPages;
}

/** Renders page `pageNumber` (1-based) so its longer edge is `longEdge` pixels. */
export async function renderPdfPage(file: File, pageNumber: number, longEdge = 2400): Promise<HTMLCanvasElement> {
  const doc = await openPdf(file);
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = longEdge / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = newCanvas(viewport.width, viewport.height);
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  return canvas;
}

/** Draws an image file onto a canvas with its longer edge capped at `longEdge` pixels. */
export async function imageToCanvas(file: File, longEdge = 2400): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = newCanvas(bitmap.width * k, bitmap.height * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

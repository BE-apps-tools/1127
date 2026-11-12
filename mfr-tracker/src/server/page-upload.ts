import { z } from 'zod';
import { AppError } from './errors';
import type { PageImageInput } from './services/scans';

export const MAX_FULL_BYTES = 2 * 1024 * 1024;
export const MAX_DETAIL_BYTES = 1.5 * 1024 * 1024;

const MetaSchema = z.object({
  pageNumber: z.number().int().min(1).optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 hex characters.'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  rotationApplied: z.number().int().refine((n) => [0, 90, 180, 270].includes(n), 'rotationApplied must be 0, 90, 180 or 270.'),
  rotationConfident: z.boolean().optional(),
});

async function readJpeg(value: FormDataEntryValue | null, name: string, max: number, required: boolean): Promise<Uint8Array | null> {
  if (value == null || typeof value === 'string') {
    if (required) throw new AppError('validation', `The ${name} image is required.`);
    return null;
  }
  if (value.size === 0 && !required) return null;
  if (value.size > max) throw new AppError('validation', `The ${name} image is larger than ${(max / 1024 / 1024).toFixed(1)} MB.`);
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new AppError('validation', `The ${name} image is not a JPEG.`);
  }
  return bytes;
}

/** Parses the multipart body of the page upload routes: `full`, optional `detail`, and a JSON `meta` field. */
export async function parsePageUpload(req: Request): Promise<PageImageInput & { pageNumber?: number; rotationConfident: boolean }> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError('malformed', 'The request body is not valid multipart form data.');
  }
  const full = await readJpeg(form.get('full'), 'full', MAX_FULL_BYTES, true);
  const detail = await readJpeg(form.get('detail'), 'detail', MAX_DETAIL_BYTES, false);
  const rawMeta = form.get('meta');
  if (typeof rawMeta !== 'string') throw new AppError('validation', 'The meta field is required.');
  let metaJson: unknown;
  try {
    metaJson = JSON.parse(rawMeta);
  } catch {
    throw new AppError('malformed', 'The meta field is not valid JSON.');
  }
  const meta = MetaSchema.parse(metaJson);
  return {
    full: full as Uint8Array,
    detail,
    sha256: meta.sha256,
    width: meta.width,
    height: meta.height,
    rotationApplied: meta.rotationApplied,
    pageNumber: meta.pageNumber,
    rotationConfident: meta.rotationConfident ?? true,
  };
}

export function idParam(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new AppError('not_found', 'Not found.');
  return n;
}

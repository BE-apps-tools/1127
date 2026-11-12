import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalStorage } from '@/server/storage/local';

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mfr-storage-'));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('local storage', () => {
  it('round-trips bytes and content type', async () => {
    const s = createLocalStorage(dir);
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    await s.put('scans/1/1.jpg', bytes, 'image/jpeg');
    const got = await s.get('scans/1/1.jpg');
    expect(got).not.toBeNull();
    expect(Array.from(got!.bytes)).toEqual(Array.from(bytes));
    expect(got!.contentType).toBe('image/jpeg');
  });

  it('returns null for a missing key', async () => {
    expect(await createLocalStorage(dir).get('scans/9/9.jpg')).toBeNull();
  });

  it('remove deletes', async () => {
    const s = createLocalStorage(dir);
    await s.put('seed/x.jpg', new Uint8Array([1]), 'image/jpeg');
    await s.remove('seed/x.jpg');
    expect(await s.get('seed/x.jpg')).toBeNull();
  });

  it('rejects keys with .. or a backslash or odd characters', async () => {
    const s = createLocalStorage(dir);
    for (const key of ['../evil.jpg', 'a/../../b.jpg', 'a\\b.jpg', '/abs.jpg', 'sp ace.jpg', '']) {
      await expect(s.put(key, new Uint8Array([1]), 'image/jpeg')).rejects.toThrow();
      await expect(s.get(key)).rejects.toThrow();
    }
  });
});

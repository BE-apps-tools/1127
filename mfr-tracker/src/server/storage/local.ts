import fs from 'node:fs/promises';
import path from 'node:path';
import { assertValidKey, type Storage } from './types';

const META_SUFFIX = '.contenttype';

/** Disk storage under `${root}`. The content type sits in a small sidecar file next to each object. */
export function createLocalStorage(root: string): Storage {
  const base = path.resolve(root);
  const resolve = (key: string) => {
    assertValidKey(key);
    const file = path.resolve(base, key);
    if (!file.startsWith(base + path.sep)) throw new Error('Invalid storage key.');
    return file;
  };
  return {
    async put(key, bytes, contentType) {
      const file = resolve(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes);
      await fs.writeFile(file + META_SUFFIX, contentType);
    },
    async get(key) {
      const file = resolve(key);
      try {
        const [bytes, ct] = await Promise.all([fs.readFile(file), fs.readFile(file + META_SUFFIX, 'utf8').catch(() => 'application/octet-stream')]);
        return { bytes: new Uint8Array(bytes), contentType: ct };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async remove(key) {
      const file = resolve(key);
      await fs.rm(file, { force: true });
      await fs.rm(file + META_SUFFIX, { force: true });
    },
  };
}

export interface Storage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  remove(key: string): Promise<void>;
}

const KEY_RE = /^[a-zA-Z0-9/_.\-]+$/;

/** Keys match ^[a-zA-Z0-9/_.\-]+$ and may not climb directories or start with a slash. */
export function assertValidKey(key: string): void {
  if (!KEY_RE.test(key) || key.includes('..') || key.startsWith('/') || key.includes('//')) {
    throw new Error('Invalid storage key.');
  }
}

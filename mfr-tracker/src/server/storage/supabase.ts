import { createClient } from '@supabase/supabase-js';
import { assertValidKey, type Storage } from './types';

function client(url: string, secretKey: string) {
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Creates the private bucket if it does not exist. "Already exists" is not an error. */
export async function ensureBucket(url: string, secretKey: string, bucket: string): Promise<void> {
  const { error } = await client(url, secretKey).storage.createBucket(bucket, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`Could not create bucket: ${error.message}`);
}

export function createSupabaseStorage(url: string, secretKey: string, bucket: string): Storage {
  const store = () => client(url, secretKey).storage.from(bucket);
  return {
    async put(key, bytes, contentType) {
      assertValidKey(key);
      const { error } = await store().upload(key, bytes, { contentType, upsert: true });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
    },
    async get(key) {
      assertValidKey(key);
      const { data, error } = await store().download(key);
      if (error || !data) return null;
      return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' };
    },
    async remove(key) {
      assertValidKey(key);
      const { error } = await store().remove([key]);
      if (error) throw new Error(`Storage remove failed: ${error.message}`);
    },
  };
}

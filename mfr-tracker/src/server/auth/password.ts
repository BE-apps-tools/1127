import bcrypt from 'bcryptjs';

export const BCRYPT_COST = 11;
export const MIN_PASSWORD_LENGTH = 10;

export function passwordPolicyError(pw: string): string | null {
  return pw.length >= MIN_PASSWORD_LENGTH ? null : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
}

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, BCRYPT_COST);
}

export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

/** Random temporary password (about 96 bits), URL-safe. */
export function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Buffer.from(bytes).toString('base64url');
}

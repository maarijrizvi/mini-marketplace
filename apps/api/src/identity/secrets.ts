import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });

export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password).catch(() => false);

/** Used when an email isn't found, so a wrong email takes as long as a wrong password. */
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword('not-a-real-password-1');
  await verifyPassword(await dummyHash, password);
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** 32 random bytes, URL-safe. Used for session cookies and reset links. */
export const randomToken = () => randomBytes(32).toString('base64url');

/** Six-digit email code. */
export const randomCode = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

/** Codes are only six digits, so the hash includes the user id; two users can hold the same code. */
export const codeHash = (userId: string, code: string) => sha256(`${userId}:${code}`);

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

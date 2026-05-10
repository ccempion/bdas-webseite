import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing per OWASP 2026. Parameters chosen for
 * server-side use; tuned for ~50ms on a modern x86 server.
 */
const PARAMS = {
  memoryCost: 19_456, // KiB → 19 MiB
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export const PASSWORD_ALGORITHM = "argon2id";

export const PASSWORD_MIN_LENGTH = 12;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, PARAMS);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, plain, PARAMS);
  } catch {
    return false;
  }
}

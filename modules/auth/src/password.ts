import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

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

export const PASSWORD_MIN_LENGTH = 10;

/**
 * Single source of truth for the password policy: length + one upper,
 * one lower, one special character. No digit is required. Register and
 * password-reset both validate through this so the rule lives in one place.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen haben`)
  .max(256, "Passwort ist zu lang")
  .regex(/[A-Z]/, "Passwort braucht mindestens einen Großbuchstaben")
  .regex(/[a-z]/, "Passwort braucht mindestens einen Kleinbuchstaben")
  .regex(/[^A-Za-z0-9]/, "Passwort braucht mindestens ein Sonderzeichen");

/** Human-readable rule, shown as the form hint (kept in sync with the schema). */
export const PASSWORD_RULE_HINT =
  "Mindestens 10 Zeichen, davon ein Großbuchstabe, ein Kleinbuchstabe und ein Sonderzeichen.";

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

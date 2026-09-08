/**
 * Single-use confirmation tokens and permanent unsubscribe tokens.
 *
 * Stored as SHA-256 hex, never in plaintext. This deliberately differs from
 * `events.guestCancelToken`, which is stored in the clear: a token that
 * *creates* a consent record deserves the stronger protection (spec §4).
 */
import { createHash, randomBytes } from "node:crypto";

/** Confirmation links are valid for seven days (spec §4). */
export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

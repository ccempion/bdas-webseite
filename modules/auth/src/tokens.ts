import { createHash, randomBytes } from "node:crypto";

/**
 * Cryptographically random URL-safe token used for email verification and
 * password reset links. 32 bytes → ~43-character base64url string; collision
 * probability is negligible at our scale.
 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Deterministic SHA-256 hash of a token, for storing a lookup-by-hash
 * column instead of the raw token. Unlike password hashing, this must be
 * deterministic (no per-hash salt) so a stored hash can be found by
 * equality against a freshly hashed incoming token — safe here because the
 * token itself is a uniformly random 256-bit value (see `randomToken`),
 * making it infeasible to reverse or precompute against.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

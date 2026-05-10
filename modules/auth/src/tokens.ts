import { randomBytes } from "node:crypto";

/**
 * Cryptographically random URL-safe token used for email verification and
 * password reset links. 32 bytes → ~43-character base64url string; collision
 * probability is negligible at our scale.
 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

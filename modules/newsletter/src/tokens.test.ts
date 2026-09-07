import { describe, expect, it } from "vitest";

import { CONFIRM_TTL_MS, hashToken, newToken } from "./tokens";

describe("newsletter tokens", () => {
  it("mints url-safe tokens of 32 random bytes", () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("never mints the same token twice", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newToken()));
    expect(seen.size).toBe(200);
  });

  it("hashes to stable lowercase sha-256 hex that is not the token", () => {
    const token = newToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    expect(hashToken(token)).toBe(hash);
    expect(hashToken(newToken())).not.toBe(hash);
  });

  it("expires confirmation links after seven days", () => {
    expect(CONFIRM_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

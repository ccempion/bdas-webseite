/**
 * App session JWT issue/verify round-trip (ADR 0002, as amended by ADR 0009).
 *
 * The token is an internal app session credential — there is no external
 * verifier. These tests assert the structural shape, a verify round-trip, and
 * that signature tampering is rejected.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { COOKIE_MAX_AGE_SECONDS, issueToken, TOKEN_VERSION, verifyToken } from "./sso";

const SECRET = "test-secret-test-secret-test-secret-123456";

const INPUT = {
  userId: "usr_test0000000000000000",
  email: "member@example.com",
  roles: ["member"] as const,
  sessionId: "ses_test0000000000000000",
};

function b64urlJson(part: string): Record<string, unknown> {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, unknown>;
}

describe("app session JWT issue/verify", () => {
  let savedSecret: string | undefined;

  beforeAll(() => {
    savedSecret = process.env["SSO_JWT_SECRET"];
    process.env["SSO_JWT_SECRET"] = SECRET;
  });

  afterAll(() => {
    if (savedSecret === undefined) delete process.env["SSO_JWT_SECRET"];
    else process.env["SSO_JWT_SECRET"] = savedSecret;
  });

  it("mints a token whose header and claims match the expected shape", async () => {
    const token = await issueToken(INPUT);
    const [h64, p64, s64] = token.split(".");
    expect(h64 && p64 && s64).toBeTruthy();

    const header = b64urlJson(h64!);
    expect(header["alg"]).toBe("HS256");
    expect(header["typ"]).toBe("JWT");

    const p = b64urlJson(p64!);
    expect(p["iss"]).toBe("bdas");
    expect(p["sub"]).toBe(INPUT.userId);
    expect(p["email"]).toBe(INPUT.email);
    expect(p["roles"]).toEqual(INPUT.roles);
    expect(p["ver"]).toBe(TOKEN_VERSION);
    expect(p["jti"]).toBe(INPUT.sessionId);
    expect(typeof p["iat"]).toBe("number");
    expect(typeof p["exp"]).toBe("number");
    expect((p["exp"] as number) - (p["iat"] as number)).toBe(COOKIE_MAX_AGE_SECONDS);
  });

  it("round-trips through verifyToken to the expected claims", async () => {
    const token = await issueToken(INPUT);
    const claims = await verifyToken(token);
    expect(claims.iss).toBe("bdas");
    expect(claims.sub).toBe(INPUT.userId);
    expect(claims.email).toBe(INPUT.email);
    expect(claims.roles).toEqual(INPUT.roles);
    expect(claims.ver).toBe(TOKEN_VERSION);
    expect(claims.jti).toBe(INPUT.sessionId);
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it("rejects a signature-tampered token", async () => {
    const token = await issueToken(INPUT);
    const parts = token.split(".");
    const last = parts[2]!;
    parts[2] = (last[last.length - 1] === "A" ? "B" : "A") + last.slice(1);
    await expect(verifyToken(parts.join("."))).rejects.toThrow();
  });
});

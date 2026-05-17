/**
 * SSO issuer ↔ WordPress-verifier contract test (ADR 0002 follow-up).
 *
 * This guards the highest-blast-radius piece of Phase 1: a token minted by the
 * Next.js issuer (`issueToken`) must verify, byte-for-byte, through the PHP
 * plugin parser (`wp-plugin/bdas-sso/src/jwt.php`).
 *
 * Split across two languages:
 *   - Here: mint from the shared fixture, assert ADR-0002 structural shape and
 *     a TS round-trip, then write the freshly minted token to
 *     `runtime-token.local` (gitignored).
 *   - CI step: `php wp-plugin/bdas-sso/test/verify-fixture.php` reads that token
 *     through the real plugin parser and asserts it decodes to the fixture's
 *     `expectClaims`. Same job → shared filesystem.
 *
 * Both sides read the same fixture, so issuer and verifier cannot drift apart
 * without one of these failing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { COOKIE_MAX_AGE_SECONDS, issueToken, TOKEN_VERSION, verifyToken } from "./sso";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, "../../../wp-plugin/bdas-sso/test");
const FIXTURE_PATH = path.join(FIXTURE_DIR, "fixture.json");
const RUNTIME_TOKEN_PATH = path.join(FIXTURE_DIR, "runtime-token.local");

type Fixture = {
  readonly secret: string;
  readonly input: {
    readonly userId: string;
    readonly email: string;
    readonly roles: ReadonlyArray<"member" | "local_board" | "federal_board" | "alumnus">;
    readonly sessionId: string;
  };
  readonly expectClaims: {
    readonly iss: string;
    readonly sub: string;
    readonly email: string;
    readonly roles: ReadonlyArray<string>;
    readonly ver: number;
  };
};

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;

function b64urlJson(part: string): Record<string, unknown> {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, unknown>;
}

describe("SSO issuer ↔ verifier contract (ADR 0002)", () => {
  let savedSecret: string | undefined;

  beforeAll(() => {
    savedSecret = process.env["SSO_JWT_SECRET"];
    process.env["SSO_JWT_SECRET"] = fixture.secret;
  });

  afterAll(() => {
    if (savedSecret === undefined) delete process.env["SSO_JWT_SECRET"];
    else process.env["SSO_JWT_SECRET"] = savedSecret;
  });

  it("mints a token whose header and claims match the ADR 0002 shape", async () => {
    const token = await issueToken(fixture.input);
    const [h64, p64, s64] = token.split(".");
    expect(h64 && p64 && s64).toBeTruthy();

    const header = b64urlJson(h64!);
    expect(header["alg"]).toBe("HS256");
    expect(header["typ"]).toBe("JWT");

    const p = b64urlJson(p64!);
    expect(p["iss"]).toBe("bdas");
    expect(p["sub"]).toBe(fixture.input.userId);
    expect(p["email"]).toBe(fixture.input.email);
    expect(p["roles"]).toEqual(fixture.input.roles);
    expect(p["ver"]).toBe(TOKEN_VERSION);
    expect(p["jti"]).toBe(fixture.input.sessionId);
    expect(typeof p["iat"]).toBe("number");
    expect(typeof p["exp"]).toBe("number");
    expect((p["exp"] as number) - (p["iat"] as number)).toBe(COOKIE_MAX_AGE_SECONDS);
  });

  it("round-trips through verifyToken to the expected claims", async () => {
    const token = await issueToken(fixture.input);
    const claims = await verifyToken(token);
    expect(claims.iss).toBe(fixture.expectClaims.iss);
    expect(claims.sub).toBe(fixture.expectClaims.sub);
    expect(claims.email).toBe(fixture.expectClaims.email);
    expect(claims.roles).toEqual(fixture.expectClaims.roles);
    expect(claims.ver).toBe(fixture.expectClaims.ver);
    expect(claims.jti).toBe(fixture.input.sessionId);
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it("rejects a signature-tampered token", async () => {
    const token = await issueToken(fixture.input);
    const parts = token.split(".");
    const last = parts[2]!;
    parts[2] = (last[last.length - 1] === "A" ? "B" : "A") + last.slice(1);
    await expect(verifyToken(parts.join("."))).rejects.toThrow();
  });

  it("writes the freshly minted token for the PHP verifier step", async () => {
    const token = await issueToken(fixture.input);
    writeFileSync(RUNTIME_TOKEN_PATH, token, "utf8");
    expect(readFileSync(RUNTIME_TOKEN_PATH, "utf8")).toBe(token);
  });
});

/**
 * SSO JWT issuer/verifier per ADR 0002.
 *
 * Cookie shape: `bdas_session`, HttpOnly, Domain=.bdas.de (prod), 7-day fixed
 * expiry. Algorithm HS256. Claims: iss, sub, email, roles, ver, iat, exp, jti.
 *
 * The `ver` claim is mandatory and strict — token-shape changes bump the
 * version and the verifier accepts both during a rollout window.
 */
import { jwtVerify, SignJWT } from "jose";

import { UnauthorizedError } from "@bdas/errors";

export const TOKEN_VERSION = 1;
export const COOKIE_NAME = "bdas_session";
export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type Role = "member" | "local_board" | "federal_board" | "alumnus";

export type SsoClaims = {
  readonly iss: "bdas";
  readonly sub: string;
  readonly email: string;
  readonly roles: ReadonlyArray<Role>;
  readonly ver: number;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
};

let cachedKey: { secret: string; key: Uint8Array } | null = null;
function key(): Uint8Array {
  const secret = process.env["SSO_JWT_SECRET"] ?? "";
  if (secret.length < 32) {
    throw new Error(
      "SSO_JWT_SECRET must be set to at least 32 characters (use `openssl rand -base64 32`).",
    );
  }
  if (!cachedKey || cachedKey.secret !== secret) {
    cachedKey = { secret, key: new TextEncoder().encode(secret) };
  }
  return cachedKey.key;
}

export type IssueArgs = {
  readonly userId: string;
  readonly email: string;
  readonly roles: ReadonlyArray<Role>;
  readonly sessionId: string;
};

/** Mint a signed JWT carrying the ADR 0002 claims. */
export async function issueToken(args: IssueArgs): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email: args.email,
    roles: args.roles,
    ver: TOKEN_VERSION,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("bdas")
    .setSubject(args.userId)
    .setJti(args.sessionId)
    .setIssuedAt(now)
    .setExpirationTime(now + COOKIE_MAX_AGE_SECONDS)
    .sign(key());
}

/**
 * Verify a JWT and return the typed claims. Throws UnauthorizedError on any
 * failure (signature, expiry, issuer, version mismatch). The caller is
 * expected to translate that into a redirect to /anmelden, never a 401.
 */
export async function verifyToken(jwt: string): Promise<SsoClaims> {
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(jwt, key(), { issuer: "bdas", algorithms: ["HS256"] });
    payload = result.payload;
  } catch (cause) {
    throw new UnauthorizedError("Session token invalid or expired", { cause });
  }

  if (payload["ver"] !== TOKEN_VERSION) {
    throw new UnauthorizedError(`Session token version ${String(payload["ver"])} not accepted`);
  }

  const sub = payload["sub"];
  const email = payload["email"];
  const roles = payload["roles"];
  const jti = payload["jti"];
  const iat = payload["iat"];
  const exp = payload["exp"];

  if (
    typeof sub !== "string" ||
    typeof email !== "string" ||
    typeof jti !== "string" ||
    typeof iat !== "number" ||
    typeof exp !== "number" ||
    !Array.isArray(roles) ||
    !roles.every((r) => typeof r === "string")
  ) {
    throw new UnauthorizedError("Session token payload malformed");
  }

  return {
    iss: "bdas",
    sub,
    email,
    roles: roles as ReadonlyArray<Role>,
    ver: TOKEN_VERSION,
    iat,
    exp,
    jti,
  };
}

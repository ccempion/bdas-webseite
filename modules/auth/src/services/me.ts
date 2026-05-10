/**
 * Read-side: who is the current request from?
 *
 * `getCurrentUser` resolves a JWT cookie value to a typed user, or returns
 * null for anonymous. `requireRole` is the gate used by privileged routes.
 *
 * The cookie itself is read by the app (Next.js `cookies()` API); these
 * functions take the raw cookie value so the auth module stays
 * framework-agnostic and is testable without Next.
 */
import { ForbiddenError } from "@bdas/errors";

import { getSession } from "../sessions.js";
import type { Db } from "../sessions.js";
import { verifyToken, type Role } from "../sso.js";

export type CurrentUser = {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  readonly roles: ReadonlyArray<Role>;
  readonly sessionId: string;
};

/**
 * Returns the user behind a JWT cookie value, or null when:
 *   - the cookie is missing,
 *   - the JWT is malformed/expired/wrong-version,
 *   - the corresponding session row is missing/revoked/expired.
 */
export async function getCurrentUser(
  db: Db,
  jwtCookieValue: string | undefined,
): Promise<CurrentUser | null> {
  if (!jwtCookieValue) return null;

  let claims;
  try {
    claims = await verifyToken(jwtCookieValue);
  } catch {
    return null;
  }

  const session = await getSession(db, claims.jti);
  if (!session) return null;

  return {
    id: session.user.id,
    email: session.user.emailNormalized,
    status: session.user.status,
    roles: claims.roles,
    sessionId: session.session.id,
  };
}

export function requireRole(user: CurrentUser | null, role: Role): asserts user is CurrentUser {
  if (!user) {
    throw new ForbiddenError("Anmeldung erforderlich.");
  }
  if (!user.roles.includes(role)) {
    throw new ForbiddenError(`Zugriff verweigert: Rolle '${role}' fehlt.`);
  }
}

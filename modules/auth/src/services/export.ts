/**
 * GDPR self-service export — the authenticated user's own `auth_users` row
 * (ADR 0008). Scoped to a single user id; callers pass the id of the
 * authenticated principal only. The `auth` module owns `auth_users`, so the
 * read lives here and is exposed as a typed service (CLAUDE.md §1 r1).
 */
import { eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { authUsers } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type UserExport = {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  readonly consentAt: Date | null;
  readonly consentVersion: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export async function getUserExport(db: Db, userId: string): Promise<UserExport | null> {
  const rows = await db
    .select({
      id: authUsers.id,
      email: authUsers.emailDisplay,
      status: authUsers.status,
      consentAt: authUsers.consentAt,
      consentVersion: authUsers.consentVersion,
      createdAt: authUsers.createdAt,
      updatedAt: authUsers.updatedAt,
    })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Account addresses for a set of ids, in one query.
 *
 * The single-user {@link getUserExport} is the wrong shape for a list: the
 * newsletter board resolves every account address on the page, and one call
 * per subscriber would be a query per row — the N+1 the batched
 * `AccountEmailResolver` signature exists to prevent.
 *
 * Unknown ids are simply absent from the map rather than present with an
 * undefined value, so a caller can use `.get()` as the existence check.
 *
 * `emailDisplay`, not `emailNormalized`: the normalised column is the
 * duplicate key, the display column is the address the person wrote and the
 * one that belongs in a list or an export.
 */
export async function getUserEmails(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  // `inArray(col, [])` is not portable — depending on the driver it renders as
  // `false` or fails to parse. An empty set is an ordinary state here (a page
  // of purely anonymous rows), so it is answered without a round trip.
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({ id: authUsers.id, email: authUsers.emailDisplay })
    .from(authUsers)
    .where(inArray(authUsers.id, [...new Set(ids)]));

  return new Map(rows.map((r) => [r.id, r.email]));
}

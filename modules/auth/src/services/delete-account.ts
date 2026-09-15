/**
 * Erasing an identity: deletes the `auth_users` row. Everything that FKs it
 * with ON DELETE CASCADE goes in the same statement — credentials, sessions and
 * tokens here, and in other modules whatever their own migrations chose to
 * cascade (`members`, `member_profiles`). Modules that keep data without such
 * an FK hear about it through `auth.user.deleted`.
 *
 * Auth-agnostic like every service in this module: it does not decide who may
 * be deleted. Today's only caller restricts it to groupless applicants without
 * a profile (ADR 0044).
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getEventBus } from "@bdas/events";

import type { UserDeleted } from "../events";
import { authUsers } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

/** `false` when there was no such account — nothing deleted, nothing published. */
export async function deleteAccount(db: Db, userId: string): Promise<boolean> {
  const [gone] = await db
    .delete(authUsers)
    .where(eq(authUsers.id, userId))
    .returning({ id: authUsers.id, email: authUsers.emailNormalized });
  if (!gone) return false;

  const event: UserDeleted = {
    type: "auth.user.deleted",
    userId: gone.id,
    email: gone.email,
    at: new Date(),
  };
  await getEventBus().publish(event);
  return true;
}

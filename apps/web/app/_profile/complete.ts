import type { Db } from "@bdas/db";
import { getMemberByUserId } from "@bdas/members";
import { getProfile } from "@bdas/profile";

/**
 * A profile is complete iff the module row is stamped (`completedAt != null`)
 * AND the member has a primary group (spec §3 "profile complete?" gate). The
 * two live in different modules; this app helper joins them by userId. `Db`
 * from @bdas/db is the same `PostgresJsDatabase<Record<string, never>>` both
 * modules accept, so no cast is needed (matches how getCurrentMember is called
 * with getDb() throughout the app).
 */
export async function isProfileComplete(db: Db, userId: string): Promise<boolean> {
  const [profile, member] = await Promise.all([
    getProfile(db, userId),
    getMemberByUserId(db, userId),
  ]);
  return profile?.completedAt != null && member?.primaryGroupId != null;
}

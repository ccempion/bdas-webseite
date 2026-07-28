import type { Db } from "@bdas/db";
import { getProfile } from "@bdas/profile";

/**
 * A profile is complete iff the module row is stamped (`completedAt != null`).
 *
 * It deliberately says nothing about the member's group. Until ADR 0031 it also
 * demanded a `primary_group_id`, which was safe only while the wizard wrote that
 * column itself. An application is now a request the destination board decides,
 * so an applicant is groupless by definition until someone accepts them —
 * keeping the conjunct meant their profile was never complete, `/profil` never
 * redirected, and they were returned to the wizard they had just finished.
 *
 * "Has this person filled everything in?" and "does this person belong to a
 * group?" are two questions; the callers that care about the second ask it
 * directly.
 */
export async function isProfileComplete(db: Db, userId: string): Promise<boolean> {
  const profile = await getProfile(db, userId);
  return profile?.completedAt != null;
}

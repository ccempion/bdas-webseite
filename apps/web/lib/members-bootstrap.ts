import { getDb } from "@bdas/db";
import { registerMembersSubscribers } from "@bdas/members";

let booted = false;

/**
 * Idempotent members bootstrap. Subscribes to groups.group.archived so an
 * archived group's open applications are closed rather than stranded (ADR 0031).
 * No feature flag: the members module is live, and an unsubscribed instance
 * would silently strand applicants.
 */
export function bootMembers(): void {
  if (booted) return;
  registerMembersSubscribers(getDb());
  booted = true;
}

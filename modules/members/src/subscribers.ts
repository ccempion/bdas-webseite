/**
 * Bridge the groups module's archive event to the application queue (ADR 0031).
 *
 * Archiving does not revoke board grants, so `groupHasActiveLocalBoard` stays
 * true and ADR 0021's federal fallback stays shut — while `canSeeGroupScope`
 * already locks a local board out of an archived group. An open application to
 * an archived group would therefore be decidable by nobody.
 *
 * They are closed as `withdrawn`, never `rejected`: no one judged the applicant,
 * so nothing may tell them they were turned down. `reason_category` stays null.
 * Handlers never throw into the producer.
 */
import { and, eq } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { getEventBus, type Subscription } from "@bdas/events";
import type { GroupArchived } from "@bdas/groups";

import type { GroupChangeWithdrawn } from "./events";
import { memberGroupChangeRequests } from "./schema";

let subs: Subscription[] = [];

export function registerMembersSubscribers(db: Db): void {
  if (subs.length > 0) return;
  subs = [
    getEventBus().subscribe<GroupArchived>("groups.group.archived", async (e) => {
      try {
        const closed = await db
          .update(memberGroupChangeRequests)
          .set({ status: "withdrawn", decidedAt: new Date(), decidedBy: "system" })
          .where(
            and(
              eq(memberGroupChangeRequests.toGroupId, e.groupId),
              eq(memberGroupChangeRequests.status, "pending"),
            ),
          )
          .returning();

        for (const row of closed) {
          const event: GroupChangeWithdrawn = {
            type: "members.group_change.withdrawn",
            requestId: row.id,
            memberId: row.memberId,
            actorUserId: "system",
            at: new Date(),
          };
          await getEventBus().publish(event);
        }
      } catch (err) {
        console.error(
          `[members] closing applications for archived group ${e.groupId} failed:`,
          err,
        );
      }
    }),
  ];
}

/** Test helper: drop all subscriptions. Not part of the public surface. */
export function unregisterMembersSubscribers(): void {
  for (const s of subs) s.unsubscribe();
  subs = [];
}

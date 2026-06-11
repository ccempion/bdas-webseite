/**
 * Bridge the groups module's group.created event to folder provisioning, so a
 * new group gets its group_members + local_board folders without files reading
 * groups' tables (CLAUDE.md §1 rules 2/3). ensureFolders at boot self-heals any
 * group whose event was missed. Handlers never throw into the producer.
 */
import type { Db } from "@bdas/db";
import { getEventBus, type Subscription } from "@bdas/events";
import { getGroup, type GroupCreated } from "@bdas/groups";

import { provisionGroupFolders } from "./services/folders";

let subs: Subscription[] = [];

export function registerFilesSubscribers(db: Db): void {
  if (subs.length > 0) return;
  subs = [
    getEventBus().subscribe<GroupCreated>("groups.group.created", async (e) => {
      try {
        const group = await getGroup(db, e.groupId);
        const name = group?.name ?? e.slug;
        await provisionGroupFolders(db, e.groupId, name);
      } catch (err) {
        console.error(`[files] provisioning folders for group ${e.groupId} failed:`, err);
      }
    }),
  ];
}

/** Test helper: drop all subscriptions. Not part of the public surface. */
export function unregisterFilesSubscribers(): void {
  for (const s of subs) s.unsubscribe();
  subs = [];
}

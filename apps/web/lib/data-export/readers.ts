import { exportSessionsForUser, getUserExport } from "@bdas/auth";
import { exportForUser as blogExport } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { exportForUser as eventsExport, exportParticipationForMember } from "@bdas/events-module";
import { isFlagOn, type FlagName } from "@bdas/feature-flags";
import { exportForUser as filesExport } from "@bdas/files";
import { exportForUser as membersExport } from "@bdas/members";
import { exportForUser as notificationsExport } from "@bdas/notifications";
import { getProfile } from "@bdas/profile";

import type { Readers } from "./assemble";

export function realReaders(): Readers {
  const db = getDb();
  return {
    enabled: (flag) => isFlagOn(flag as FlagName),
    account: async (id) => (await getUserExport(db, id)) as Record<string, unknown> | null,
    sessions: (id) => exportSessionsForUser(db, id) as Promise<readonly Record<string, unknown>[]>,
    member: async (id) => {
      const m = await membersExport(db, id);
      return {
        member: m.member,
        roleGrants: m.roleGrants,
        groupChangeRequests: m.groupChangeRequests,
      };
    },
    profile: async (id) => (await getProfile(db, id)) as Record<string, unknown> | null,
    participation: (memberId) => exportParticipationForMember(db, memberId),
    organizedEvents: (id) => eventsExport(db, id),
    files: (id) => filesExport(db, id) as Promise<readonly Record<string, unknown>[]>,
    blog: async (id) => {
      const b = await blogExport(db, id);
      return { posts: b.posts, comments: b.comments };
    },
    notifications: (id) =>
      notificationsExport(db, id) as Promise<readonly Record<string, unknown>[]>,
  };
}

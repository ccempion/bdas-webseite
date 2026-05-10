/**
 * @bdas/groups — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to
 * other workspaces. Internal files are not importable.
 */

export { listGroups, type ListOpts } from "./services/list.js";
export { getGroup, getGroupBySlug } from "./services/get.js";
export { getJoinPolicy } from "./services/join-policy.js";
export { upsertGroupBySlug, UpsertGroupInput, type UpsertResult } from "./services/upsert.js";

export type { Group, GroupSummary, GroupStatus, JoinPolicy } from "./types.js";
export type { GroupEvent, GroupCreated, GroupUpdated } from "./events.js";

/**
 * @bdas/groups — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to
 * other workspaces. Internal files are not importable.
 */

export { listGroups, type ListOpts } from "./services/list";
export { getGroup, getGroupBySlug } from "./services/get";
export { getJoinPolicy } from "./services/join-policy";
export { upsertGroupBySlug, UpsertGroupInput, type UpsertResult } from "./services/upsert";
export {
  createGroup,
  updateGroup,
  archiveGroup,
  CreateGroupInput,
  UpdateGroupInput,
} from "./services/manage";

export type { Group, GroupSummary, GroupStatus, JoinPolicy } from "./types";
export type { GroupEvent, GroupCreated, GroupUpdated, GroupArchived } from "./events";

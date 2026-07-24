/**
 * @bdas/members — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to
 * other workspaces.
 */

export {
  createProfile,
  updateProfile,
  CreateProfileInput,
  UpdateProfileInput,
} from "./services/profile";
export { transitionStatus, approveMember, type Actor } from "./services/status";
export { grantRole, revokeRole } from "./services/roles";
export { getMember, getMemberByUserId } from "./services/get";
export { listBoardRecipientsForGroup } from "./services/board-recipients";
export { listPendingMembers } from "./services/list-pending";
export { getCurrentMember, requireFederalBoard, type CurrentMember } from "./services/me";

export {
  canTransition,
  effectiveGrants,
  isRole,
  isFederalBoard,
  canManageGroup,
  canGrantLocalBoard,
  canDecideJoinRequest,
} from "./roles";

export {
  changePrimaryGroup,
  withdrawGroupChange,
  decideGroupChange,
  getOpenGroupChange,
  listOpenGroupChanges,
  listIncomingGroupChanges,
  getGroupChangeHistory,
} from "./services/group-change";

export { listMembers, type MemberQuery } from "./services/list-members";
export {
  listRoleHolders,
  listGrantAudit,
  type RoleHolder,
  type GrantAuditEntry,
} from "./services/role-views";
export {
  countMembersByStatus,
  signupsOverTime,
  type StatusCounts,
  type SignupPoint,
} from "./services/stats";

export type {
  Member,
  MemberStatus,
  PendingMember,
  Grant,
  GroupChangeRequest,
  GroupChangeStatus,
  GroupChangeResult,
  OpenGroupChange,
  IncomingGroupChange,
} from "./types";
export type {
  MembersEvent,
  ProfileCreated,
  ProfileUpdated,
  StatusChanged,
  RoleGranted,
  RoleRevoked,
  GroupChangeRequested,
  GroupChangeDecided,
  GroupChangeWithdrawn,
} from "./events";

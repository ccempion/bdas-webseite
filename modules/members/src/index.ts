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
export { listPendingMembers } from "./services/list-pending";
export { getCurrentMember, requireFederalBoard, type CurrentMember } from "./services/me";

export {
  canTransition,
  effectiveGrants,
  isRole,
  isFederalBoard,
  canManageGroup,
  canGrantLocalBoard,
  canApproveMember,
} from "./roles";

export type { Member, MemberStatus, PendingMember, Grant } from "./types";
export type {
  MembersEvent,
  ProfileCreated,
  ProfileUpdated,
  StatusChanged,
  RoleGranted,
  RoleRevoked,
} from "./events";

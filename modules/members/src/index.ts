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
} from "./services/profile.js";
export { transitionStatus, approveMember, type Actor } from "./services/status.js";
export { grantRole, revokeRole } from "./services/roles.js";
export { getMember, getMemberByUserId } from "./services/get.js";
export { listPendingMembers } from "./services/list-pending.js";
export { getCurrentMember, requireFederalBoard, type CurrentMember } from "./services/me.js";

export { canTransition, effectiveRoles, isRole } from "./roles.js";

export type { Member, MemberStatus, PendingMember } from "./types.js";
export type {
  MembersEvent,
  ProfileCreated,
  ProfileUpdated,
  StatusChanged,
  RoleGranted,
  RoleRevoked,
} from "./events.js";

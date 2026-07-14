import type { Role } from "@bdas/auth";

import type { MemberStatus } from "./types";

export type ProfileCreated = {
  readonly type: "members.profile.created";
  readonly memberId: string;
  readonly userId: string;
  readonly at: Date;
};

export type ProfileUpdated = {
  readonly type: "members.profile.updated";
  readonly memberId: string;
  readonly at: Date;
};

export type StatusChanged = {
  readonly type: "members.status.changed";
  readonly memberId: string;
  readonly from: MemberStatus;
  readonly to: MemberStatus;
  readonly actorUserId: string;
  readonly at: Date;
};

export type RoleGranted = {
  readonly type: "members.role.granted";
  readonly memberId: string;
  readonly role: Role;
  readonly groupId: string | null;
  readonly actorUserId: string;
  readonly at: Date;
};

export type RoleRevoked = {
  readonly type: "members.role.revoked";
  readonly memberId: string;
  readonly role: Role;
  readonly groupId: string | null;
  readonly actorUserId: string;
  readonly at: Date;
};

export type GroupChangeRequested = {
  readonly type: "members.group_change.requested";
  readonly requestId: string;
  readonly memberId: string;
  readonly fromGroupId: string | null;
  readonly toGroupId: string;
  readonly at: Date;
};

export type GroupChangeDecided = {
  readonly type: "members.group_change.decided";
  readonly requestId: string;
  readonly memberId: string;
  readonly fromGroupId: string | null;
  readonly toGroupId: string | null;
  readonly decision: "approved" | "rejected";
  readonly actorUserId: string;
  readonly at: Date;
};

export type GroupChangeWithdrawn = {
  readonly type: "members.group_change.withdrawn";
  readonly requestId: string;
  readonly memberId: string;
  readonly actorUserId: string;
  readonly at: Date;
};

export type MembersEvent =
  | ProfileCreated
  | ProfileUpdated
  | StatusChanged
  | RoleGranted
  | RoleRevoked
  | GroupChangeRequested
  | GroupChangeDecided
  | GroupChangeWithdrawn;

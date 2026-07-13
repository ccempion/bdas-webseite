import type { Role } from "@bdas/auth";

export type MemberStatus = "pending" | "active" | "inactive" | "alumnus";

export type Member = {
  readonly id: string;
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly primaryGroupId: string | null;
  readonly status: MemberStatus;
  readonly joinedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PendingMember = Member & { readonly status: "pending" };

/**
 * One effective authority (ADR 0007). `groupId` null ⇔ unscoped
 * (federal_board, status-implied member/alumnus); set ⇔ scoped to a group
 * (local_board).
 */
export type Grant = {
  readonly role: Role;
  readonly groupId: string | null;
};

export type GroupChangeStatus = "pending" | "approved" | "rejected" | "withdrawn";

/**
 * One recorded group movement (ADR 0022). `fromGroupId` null ⇔ the member had no
 * group; `toGroupId` null ⇔ the member left the group structure (always
 * `approved` on write — an exit needs no decision).
 */
export type GroupChangeRequest = {
  readonly id: string;
  readonly memberId: string;
  readonly fromGroupId: string | null;
  readonly toGroupId: string | null;
  readonly status: GroupChangeStatus;
  readonly requestedAt: Date;
  readonly decidedAt: Date | null;
  readonly decidedBy: string | null;
};

/**
 * What `changePrimaryGroup` did: wrote the column straight through (`applied` —
 * a pending member editing their choice, or any member leaving), or filed a
 * request for the destination board (`requested`).
 */
export type GroupChangeResult =
  | { readonly kind: "applied"; readonly member: Member }
  | { readonly kind: "requested"; readonly request: GroupChangeRequest };

/** An open request plus whether *this* actor may decide it. */
export type OpenGroupChange = GroupChangeRequest & { readonly canDecide: boolean };

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

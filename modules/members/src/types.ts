import type { Role } from "@bdas/auth";

export type MemberStatus = "pending" | "active" | "inactive" | "alumnus";

export type Member = {
  readonly id: string;
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly primaryGroupId: string | null;
  readonly status: MemberStatus;
  readonly roles: ReadonlyArray<Role>;
  readonly joinedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PendingMember = Member & { readonly status: "pending" };

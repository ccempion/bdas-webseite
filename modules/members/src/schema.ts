import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    primaryGroupId: text("primary_group_id"),
    status: text("status").notNull().default("pending"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("members_status_idx").on(t.status),
    groupIdx: index("members_group_idx").on(t.primaryGroupId),
  }),
);

export type MemberRow = typeof members.$inferSelect;

/**
 * Scoped role grants (ADR 0007). `groupId` NULL ⇔ unscoped (federal_board);
 * set ⇔ scoped (local_board of that group). `revokedAt` NULL ⇔ active.
 */
export const memberRoleGrants = pgTable(
  "member_role_grants",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull(),
    role: text("role").notNull(),
    groupId: text("group_id"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    grantedBy: text("granted_by").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by"),
  },
  (t) => ({
    activeUq: uniqueIndex("member_role_grants_active_uq")
      .on(t.memberId, t.role, sql`COALESCE(${t.groupId}, '')`)
      .where(sql`${t.revokedAt} IS NULL`),
    memberIdx: index("member_role_grants_member_idx")
      .on(t.memberId)
      .where(sql`${t.revokedAt} IS NULL`),
    groupIdx: index("member_role_grants_group_idx")
      .on(t.groupId)
      .where(sql`${t.revokedAt} IS NULL`),
  }),
);

export type MemberRoleGrantRow = typeof memberRoleGrants.$inferSelect;

import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    primaryGroupId: text("primary_group_id"),
    status: text("status").notNull().default("pending"),
    roles: text("roles")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
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

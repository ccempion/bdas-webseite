import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Drizzle table definition for query building. The authoritative DDL — FKs,
// CHECKs — lives in migrations/0001_init.sql.

/**
 * The only table this module owns (CLAUDE.md §1 rule 1). Every transactional
 * send writes one row here for audit; the dashboard app surfaces it later.
 */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: text("id").primaryKey(),
    // null for a guest (non-member) recipient; to_email carries the address.
    memberId: text("member_id"),
    channel: text("channel").notNull().default("email"),
    template: text("template").notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    eventId: text("event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    memberIdx: index("notification_log_member_idx").on(t.memberId),
    createdIdx: index("notification_log_created_idx").on(t.createdAt),
  }),
);

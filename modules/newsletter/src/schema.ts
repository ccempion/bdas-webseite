import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  userId: text("user_id"),
  status: text("status").notNull(),
  confirmTokenHash: text("confirm_token_hash"),
  confirmExpiresAt: timestamp("confirm_expires_at", { withTimezone: true }),
  unsubscribeTokenHash: text("unsubscribe_token_hash").notNull(),
  source: text("source").notNull(),
  sourcePath: text("source_path"),
  groupId: text("group_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
});

export const newsletterConsentLog = pgTable("newsletter_consent_log", {
  id: text("id").primaryKey(),
  subscriberId: text("subscriber_id").notNull(),
  event: text("event").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  source: text("source"),
  sourcePath: text("source_path"),
});

export const newsletterRateLimits = pgTable("newsletter_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const newsletterPrompts = pgTable("newsletter_prompts", {
  userId: text("user_id").primaryKey(),
  lastDismissedAt: timestamp("last_dismissed_at", { withTimezone: true }).notNull().defaultNow(),
  dismissCount: integer("dismiss_count").notNull().default(0),
});

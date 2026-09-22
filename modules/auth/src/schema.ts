import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey(),
  emailNormalized: text("email_normalized").notNull().unique(),
  emailDisplay: text("email_display").notNull(),
  status: text("status").notNull().default("unverified"),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  consentVersion: text("consent_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authCredentials = pgTable("auth_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  hashedPassword: text("hashed_password").notNull(),
  algorithm: text("algorithm").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("auth_sessions_user_idx").on(t.userId),
    expiresIdx: index("auth_sessions_expires_idx").on(t.expiresAt),
  }),
);

export const authEmailVerifications = pgTable(
  "auth_email_verifications",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("auth_email_verifications_user_idx").on(t.userId) }),
);

export const authPasswordResets = pgTable(
  "auth_password_resets",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("auth_password_resets_user_idx").on(t.userId) }),
);

export const authEmailChanges = pgTable(
  "auth_email_changes",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    newEmailNormalized: text("new_email_normalized").notNull(),
    newEmailDisplay: text("new_email_display").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("auth_email_changes_user_idx").on(t.userId),
    newEmailIdx: index("auth_email_changes_new_email_idx").on(t.newEmailNormalized),
  }),
);

export const authRateLimits = pgTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const accountDeletionRequests = pgTable(
  "account_deletion_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => authUsers.id, { onDelete: "set null" }),
    emailSnapshot: text("email_snapshot").notNull(),
    nameSnapshot: text("name_snapshot").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    scheduledPurgeAt: timestamp("scheduled_purge_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    reactivationTokenHash: text("reactivation_token_hash"),
    reactivationExpiresAt: timestamp("reactivation_expires_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("account_deletion_requests_user_idx").on(t.userId),
    statusIdx: index("account_deletion_requests_status_idx").on(t.status, t.scheduledPurgeAt),
    userPendingUq: uniqueIndex("account_deletion_requests_user_pending_idx")
      .on(t.userId)
      .where(sql`${t.status} = 'pending'`),
    reactivationTokenHashUq: uniqueIndex("account_deletion_requests_reactivation_token_hash_idx")
      .on(t.reactivationTokenHash)
      .where(sql`${t.reactivationTokenHash} is not null`),
  }),
);

export const accountDeletionSteps = pgTable(
  "account_deletion_steps",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => accountDeletionRequests.id, { onDelete: "cascade" }),
    moduleName: text("module_name").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestModuleUq: unique("account_deletion_steps_request_module_uq").on(
      t.requestId,
      t.moduleName,
    ),
  }),
);

export type AuthUser = typeof authUsers.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type AccountDeletionRequest = typeof accountDeletionRequests.$inferSelect;

// Re-export sql for service-layer raw fragments where Drizzle's API isn't enough.
export { sql };

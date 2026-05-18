import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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

export const authRateLimits = pgTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type AuthUser = typeof authUsers.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;

// Re-export sql for service-layer raw fragments where Drizzle's API isn't enough.
export { sql };

import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { Answers } from "./types";

/**
 * Owned solely by @bdas/onboarding. The FK to auth_users lives in the
 * migration only (see 0001_init.sql), so this file imports nothing foreign.
 */
export const onboardingJourneys = pgTable(
  "onboarding_journeys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().unique(),
    flowVersion: integer("flow_version").notNull(),
    answers: jsonb("answers").$type<Answers>().notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    entrySource: text("entry_source").notNull(),
    outcome: text("outcome").notNull(),
    stadt: text("stadt"),
    status: text("status").notNull(),
    applicationRef: text("application_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    outcomeStatusIdx: index("onboarding_journeys_outcome_status_idx").on(t.outcome, t.status),
  }),
);

export type JourneyRow = typeof onboardingJourneys.$inferSelect;

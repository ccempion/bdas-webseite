import { pgTable, text, date, timestamp } from "drizzle-orm/pg-core";

/**
 * Extended member profile, owned solely by @bdas/profile. Linked to identity
 * by `userId` (matches auth_users.id) with no cross-module FK, like
 * members.userId. `completed_at` stamps the first successful full submit.
 */
export const memberProfiles = pgTable("member_profiles", {
  userId: text("user_id").primaryKey(),
  studiengang: text("studiengang").notNull(),
  abschlussart: text("abschlussart").notNull(),
  uni: text("uni").notNull(),
  geburtsdatum: date("geburtsdatum").notNull(),
  gefundenDurch: text("gefunden_durch").notNull(),
  empfehlerName: text("empfehler_name"),
  photoStorageKey: text("photo_storage_key"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull(),
});

export type MemberProfileRow = typeof memberProfiles.$inferSelect;

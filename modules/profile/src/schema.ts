import { pgTable, text, date, timestamp } from "drizzle-orm/pg-core";

/**
 * Extended member profile, owned solely by @bdas/profile. Keyed by `userId`,
 * which FKs `auth_users(id) ON DELETE CASCADE` so a GDPR erasure takes the
 * profile with it (profile/0002) — the same shape members.user_id has. The
 * constraint lives in the migration, not here, so this schema needs no
 * cross-module import. `completed_at` stamps the first successful full submit.
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

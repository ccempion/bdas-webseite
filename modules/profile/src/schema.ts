import { pgTable, text, date, timestamp } from "drizzle-orm/pg-core";

/**
 * Extended member profile, owned solely by @bdas/profile. Keyed by `userId`,
 * which FKs `auth_users(id) ON DELETE CASCADE` so a GDPR erasure takes the
 * profile with it (profile/0002) — the same shape members.user_id has. The
 * constraint lives in the migration, not here, so this schema needs no
 * cross-module import. `completed_at` stamps the first successful full submit.
 * `nutzertyp` decides which columns are required; the CHECK in 0004 enforces it.
 */
export const memberProfiles = pgTable("member_profiles", {
  userId: text("user_id").primaryKey(),
  nutzertyp: text("nutzertyp").notNull(),
  studiengang: text("studiengang"),
  studienfachKategorie: text("studienfach_kategorie"),
  abschlussart: text("abschlussart"),
  uni: text("uni"),
  geburtsdatum: date("geburtsdatum"),
  interesse: text("interesse"),
  bdajFunktion: text("bdaj_funktion"),
  gefundenDurch: text("gefunden_durch").notNull(),
  empfehlerName: text("empfehler_name"),
  vorstellung: text("vorstellung"),
  photoStorageKey: text("photo_storage_key"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull(),
});

export type MemberProfileRow = typeof memberProfiles.$inferSelect;

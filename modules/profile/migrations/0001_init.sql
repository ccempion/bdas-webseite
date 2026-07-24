-- Profile module — extended member data (course of study, degree, university,
-- birth date, referral, optional photo). Owned solely by @bdas/profile.
-- Design: docs/superpowers/specs/2026-07-23-profile-data-design.md (#52/#96/#97).

CREATE TABLE member_profiles (
  user_id            text PRIMARY KEY,
  studiengang        text NOT NULL,
  abschlussart       text NOT NULL,
  uni                text NOT NULL,
  geburtsdatum       date NOT NULL,
  gefunden_durch     text NOT NULL,
  empfehler_name     text,
  photo_storage_key  text,
  completed_at       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         text NOT NULL
);

-- RLS lockdown: the app reaches this table only via the service-role /
-- direct-Postgres path (bypasses RLS). No permissive policy ⇒ Supabase
-- `anon` and `authenticated` roles are denied. ENABLE is idempotent.
ALTER TABLE member_profiles ENABLE ROW LEVEL SECURITY;

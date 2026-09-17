-- Onboarding module — one guided sign-up journey per account
-- (docs/superpowers/specs/2026-09-16-onboarding-wizard-design.md §5.1).
--
-- user_id FKs auth_users with ON DELETE CASCADE, the shape members/0001 and
-- profile/0002 already use: an account that is never confirmed is deleted by
-- the existing clean-up (ADR 0044), and its journey must go with it. The
-- reference lives in SQL only, so the Drizzle schema needs no cross-module import.

CREATE TABLE onboarding_journeys (
  id               text PRIMARY KEY,
  user_id          text NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE,
  flow_version     integer NOT NULL,
  -- Part 1 answers as the browser sent them, cleaned by sanitizeAnswers.
  answers          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Part 3 draft (saveDetails). The authoritative copy is written to
  -- @bdas/profile on submit; this column only survives a closed window.
  details          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Whitelisted in normalizeSource; unknown sources are stored as 'direkt'.
  entry_source     text NOT NULL DEFAULT 'direkt',
  outcome          text NOT NULL CHECK (outcome IN (
    'student','student_ohne_gruppe','alumnus','foerderer','bdaj'
  )),
  -- Where demand comes from ("Gruppe gründen", spec §3). Free text by design.
  stadt            text,
  status           text NOT NULL DEFAULT 'details_offen'
    CHECK (status IN ('details_offen','abgeschickt')),
  -- The group-change request id in @bdas/members. Plain text, no FK: the
  -- request table belongs to another module.
  application_ref  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX onboarding_journeys_outcome_status_idx
  ON onboarding_journeys (outcome, status);

-- RLS lockdown (spec §9): the app reaches this table only through the direct
-- Postgres connection, which bypasses RLS. No permissive policy, so Supabase's
-- anon and authenticated roles are denied.
ALTER TABLE onboarding_journeys ENABLE ROW LEVEL SECURITY;

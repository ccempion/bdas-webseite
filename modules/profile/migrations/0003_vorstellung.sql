-- Issue #122: an optional free-text introduction on the application.
--
-- The board decides `pending → active` by hand and, without a recommender,
-- sees only structured facts — course, university, birth date, photo. This
-- gives an applicant a place to say why they want to join, in their own words.
--
-- Deliberately NOT a verification: nothing here is checked, and nothing may
-- gate on it (ADR 0029 decision 4 — self-typed input is a signal, not proof).
-- Optional by design; an empty field is never grounds for rejection.
--
-- Nullable and unconstrained beyond a length cap: every existing profile
-- predates the field, and backfilling a made-up value would be worse than
-- leaving it empty.

ALTER TABLE member_profiles
  ADD COLUMN vorstellung text;

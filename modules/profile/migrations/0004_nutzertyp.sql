-- Field sets per user type (spec 2026-09-16-onboarding-wizard-design.md §4.3).
--
-- Until now every profile was a student's: all four study columns NOT NULL.
-- The onboarding wizard also takes alumni, supporters and BDAJ officials, each
-- with a different set of fields. `nutzertyp` says which set applies, and one
-- CHECK enforces it in both directions — the database, not only the form,
-- refuses a supporter row without an interest or a student row without a
-- birth date.
--
-- Every existing row is a student's and satisfies the student branch, so the
-- default backfills them correctly. It also stays: code deployed before this
-- migration (a rollback, or the old build still serving mid-deploy) inserts
-- without `nutzertyp` and must keep saving student profiles. The current code
-- always writes the type explicitly.

ALTER TABLE member_profiles
  ADD COLUMN nutzertyp text NOT NULL DEFAULT 'student'
    CHECK (nutzertyp IN ('student', 'alumnus', 'foerderer', 'bdaj')),
  -- Stored, not just used to filter the subject list: a subject the list
  -- misses still lands in a known category (decision 2026-09-16).
  ADD COLUMN studienfach_kategorie text,
  ADD COLUMN interesse text,
  ADD COLUMN bdaj_funktion text
    CHECK (bdaj_funktion IN ('vorstandsmitglied', 'mitglied', 'geschaeftsstelle'));

ALTER TABLE member_profiles
  ALTER COLUMN studiengang DROP NOT NULL,
  ALTER COLUMN abschlussart DROP NOT NULL,
  ALTER COLUMN uni DROP NOT NULL,
  ALTER COLUMN geburtsdatum DROP NOT NULL;

ALTER TABLE member_profiles
  ADD CONSTRAINT member_profiles_fieldset_check CHECK (
    (nutzertyp = 'student'
      AND studiengang IS NOT NULL AND abschlussart IS NOT NULL
      AND uni IS NOT NULL AND geburtsdatum IS NOT NULL)
    OR (nutzertyp = 'alumnus' AND studiengang IS NOT NULL AND uni IS NOT NULL)
    OR (nutzertyp = 'foerderer' AND interesse IS NOT NULL)
    OR (nutzertyp = 'bdaj' AND bdaj_funktion IS NOT NULL)
  );

-- Self-service account deletion (DSGVO Art. 17). Events are institutional
-- club history, not personal expression — the event itself survives a
-- deletion; only the organizer reference is cleared. See design spec §5
-- step 3 and docs/superpowers/specs/2026-09-22-account-deletion-design.md.
--
-- created_by was NOT NULL since 0001_init.sql, with no way to represent "the
-- organizer's account no longer exists" without this.

ALTER TABLE events ALTER COLUMN created_by DROP NOT NULL;

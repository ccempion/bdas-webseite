-- Members module — add the `page_editor` role to the grant domain (ADR 0025).
-- Group-scoped: a per-group content delegate for the public group page
-- ("local_board restricted to the page surface"). Additive; the CHECK domain
-- widens via the drop+recreate shape established in 0003. No backfill.
ALTER TABLE member_role_grants
  DROP CONSTRAINT member_role_grants_role_check;

ALTER TABLE member_role_grants
  ADD CONSTRAINT member_role_grants_role_check
  CHECK (role IN ('member', 'local_board', 'local_board_lead', 'federal_board', 'alumnus', 'event_organizer', 'page_editor'));
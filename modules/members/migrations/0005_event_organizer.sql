-- Members module — add the `event_organizer` role to the grant domain (ADR 0017).
-- Group-scoped like local_board: a per-group events delegate ("local_board
-- restricted to the events surface"). Additive; the CHECK domain widens via the
-- drop+recreate shape established in 0003. No backfill; existing grants unaffected.
ALTER TABLE member_role_grants
  DROP CONSTRAINT member_role_grants_role_check;

ALTER TABLE member_role_grants
  ADD CONSTRAINT member_role_grants_role_check
  CHECK (role IN ('member', 'local_board', 'local_board_lead', 'federal_board', 'alumnus', 'event_organizer'));

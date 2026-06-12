-- Members module — local board delegation (ADR 0013).
--
-- Federal board appoints `local_board_lead` (group-scoped, several per group);
-- a lead may then grant/revoke `local_board` within its own group. Modelled as
-- another scoped-grant value so the existing member_role_grants machinery
-- (scope column, active-unique index, FK cascade) is reused unchanged. Only the
-- role CHECK domain widens — the one-line drop+recreate 0002 anticipated.
ALTER TABLE member_role_grants
  DROP CONSTRAINT member_role_grants_role_check;

ALTER TABLE member_role_grants
  ADD CONSTRAINT member_role_grants_role_check
  CHECK (role IN ('member', 'local_board', 'local_board_lead', 'federal_board', 'alumnus'));

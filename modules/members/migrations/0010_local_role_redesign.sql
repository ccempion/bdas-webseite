-- Members module — local role redesign: collapse `local_board` into
-- `local_board_lead` ("Lead"), and widen the grant domain with two new
-- group-scoped delegate roles, `file_manager` and `blogger`.
--
-- Before this migration, `local_board_lead` was already a superset of
-- `local_board` for the "manage this group" authority (canManageGroup,
-- canDecideJoinRequest, board-access predicates) — but NOT for granting the
-- group's delegate roles or editing its public page (canGrantLocalRoles /
-- canEditGroupPage checked only `local_board_lead`). This migration
-- deliberately upgrades every remaining plain `local_board` holder to full
-- Lead authority, including those two rights — "Vorstände behalten ihre
-- Rechte, werden zu Lead" per the local role redesign brief, not merely a
-- same-rights rename. Hard cutover: the site is pre-production, so this
-- ships without an expand/contract split (unlike 0007's additive-only
-- widening).
--
-- Order: widen the CHECK first (so the rename below is legal under the new
-- domain), backfill, then narrow the CHECK to remove `local_board` for good.

ALTER TABLE member_role_grants
  DROP CONSTRAINT member_role_grants_role_check;

ALTER TABLE member_role_grants
  ADD CONSTRAINT member_role_grants_role_check
  CHECK (role IN ('member', 'local_board', 'local_board_lead', 'federal_board', 'alumnus', 'event_organizer', 'page_editor', 'file_manager', 'blogger'));

-- Step 1: where a member already holds an ACTIVE local_board_lead grant for
-- the same group, the plain local_board grant is now redundant. Revoke it
-- rather than rename it — renaming it too would collide with the partial
-- unique index member_role_grants_active_uq (member_id, role, group_id)
-- WHERE revoked_at IS NULL, since the target row would already exist.
UPDATE member_role_grants lb
SET revoked_at = now(), revoked_by = 'system:0010-local-role-redesign'
WHERE lb.role = 'local_board'
  AND lb.revoked_at IS NULL
  AND EXISTS (
    SELECT 1 FROM member_role_grants lead
    WHERE lead.member_id = lb.member_id
      AND lead.role = 'local_board_lead'
      AND lead.group_id IS NOT DISTINCT FROM lb.group_id
      AND lead.revoked_at IS NULL
  );

-- Step 2: every remaining local_board row — active or already-revoked
-- history — becomes local_board_lead outright. The audit log is rewritten
-- to match rather than layered with a "formerly local_board" annotation
-- (existing board members keep their rights as Lead, retroactively too).
UPDATE member_role_grants
SET role = 'local_board_lead'
WHERE role = 'local_board';

-- Step 3: local_board no longer exists as a role from this point forward.
ALTER TABLE member_role_grants
  DROP CONSTRAINT member_role_grants_role_check;

ALTER TABLE member_role_grants
  ADD CONSTRAINT member_role_grants_role_check
  CHECK (role IN ('member', 'local_board_lead', 'federal_board', 'alumnus', 'event_organizer', 'page_editor', 'file_manager', 'blogger'));

-- Files module — central distribution folder for local Vorstände (2026-09-12).
--
-- Third federation-wide singleton (group_id NULL), alongside members_all and
-- federal_board. Only the federal board may write to it; every group's Lead
-- (local_board_lead) may read it — see permissions.ts. The row itself is
-- provisioned by ensureFolders' SINGLETONS list, not by this migration.

ALTER TABLE folders DROP CONSTRAINT folders_scope_chk;
ALTER TABLE folders ADD CONSTRAINT folders_scope_chk CHECK (
  scope IN ('members_all', 'group_members', 'local_board', 'federal_board', 'board_broadcast')
);

ALTER TABLE folders DROP CONSTRAINT folders_scope_group_chk;
ALTER TABLE folders ADD CONSTRAINT folders_scope_group_chk CHECK (
  (scope IN ('group_members', 'local_board') AND group_id IS NOT NULL)
  OR (scope IN ('members_all', 'federal_board', 'board_broadcast') AND group_id IS NULL)
);

-- Members module — scoped role grants (ADR 0007).
--
-- Replaces the unscoped `members.roles text[]` shortcut with the spec §8
-- `member_role_grants` table. `group_id IS NULL` means an unscoped grant
-- (federal_board); a set `group_id` means scoped (local_board of that group).
--
-- The spec sketches `scope` as a single string ('local_board:slug'); ADR 0007
-- deliberately normalises it into (role, group_id) so the DB enforces the FK
-- to groups, cascades on group deletion, and rejects duplicate active grants.

CREATE TABLE member_role_grants (
  id          text PRIMARY KEY,
  member_id   text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role        text NOT NULL,
  group_id    text REFERENCES groups(id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  text NOT NULL,
  revoked_at  timestamptz
);

-- Same rationale as groups_status_check: a CHECK (not a Postgres enum) keeps
-- the role domain honest against seed scripts / manual SQL while staying a
-- one-line drop+recreate to evolve.
ALTER TABLE member_role_grants
  ADD CONSTRAINT member_role_grants_role_check
  CHECK (role IN ('member', 'local_board', 'federal_board', 'alumnus'));

-- One active grant per (member, role, group). NULL group_id is folded to ''
-- so an unscoped grant is also de-duplicated. Revoked rows are history and
-- excluded from the constraint.
CREATE UNIQUE INDEX member_role_grants_active_uq
  ON member_role_grants (member_id, role, COALESCE(group_id, ''))
  WHERE revoked_at IS NULL;

CREATE INDEX member_role_grants_member_idx
  ON member_role_grants (member_id)
  WHERE revoked_at IS NULL;

CREATE INDEX member_role_grants_group_idx
  ON member_role_grants (group_id)
  WHERE revoked_at IS NULL;

-- Backfill: every existing roles[] entry becomes an UNSCOPED grant. Old data
-- carried no group, so an old 'local_board' becomes a (meaningless-going-
-- forward) unscoped grant — this is the documented negative consequence in
-- ADR 0007. Acceptable: schema is pre-production (local/CI only). No-op on a
-- fresh database (members empty).
INSERT INTO member_role_grants (id, member_id, role, group_id, granted_at, granted_by)
SELECT
  'mrg_' || replace(gen_random_uuid()::text, '-', ''),
  m.id,
  r.role,
  NULL,
  now(),
  'system:adr-0007-backfill'
FROM members m
CROSS JOIN LATERAL unnest(m.roles) AS r(role);

ALTER TABLE members DROP COLUMN roles;

-- Members module — group transfer requests (ADR 0022).
--
-- One row per group movement. The table is both the pending queue and the
-- history log: `pending` rows await a decision by the DESTINATION group's board,
-- terminal rows (`approved` / `rejected` / `withdrawn`) are the audit trail.
--
-- `to_group_id` NULL ⇔ the member left the group structure entirely; such a row
-- is written already `approved` (an exit needs no approval).
-- `from_group_id` NULL ⇔ the member had no group (first group after signup).
CREATE TABLE member_group_change_requests (
  id            TEXT PRIMARY KEY,
  member_id     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  from_group_id TEXT REFERENCES groups(id),
  to_group_id   TEXT REFERENCES groups(id),
  status        TEXT NOT NULL DEFAULT 'pending',
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,
  decided_by    TEXT,
  CONSTRAINT member_group_change_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  -- A row is decided iff it is no longer pending.
  CONSTRAINT member_group_change_requests_decided_check
    CHECK ((status = 'pending') = (decided_at IS NULL)),
  -- Only an exit may be groupless, and a move must actually move.
  CONSTRAINT member_group_change_requests_moves_check
    CHECK (from_group_id IS DISTINCT FROM to_group_id)
);

-- At most one open request per member.
CREATE UNIQUE INDEX member_group_change_requests_open_uq
  ON member_group_change_requests (member_id)
  WHERE status = 'pending';

CREATE INDEX member_group_change_requests_member_idx
  ON member_group_change_requests (member_id);

-- The destination board's queue.
CREATE INDEX member_group_change_requests_to_group_idx
  ON member_group_change_requests (to_group_id)
  WHERE status = 'pending';

-- The origin group's view of members leaving.
CREATE INDEX member_group_change_requests_from_group_idx
  ON member_group_change_requests (from_group_id)
  WHERE status = 'pending';

-- Row-Level Security lockdown, matching `members` / `member_role_grants` (and the
-- idiom in files/0002_rls_lockdown.sql). The app reaches this table only over the
-- service-role / direct-Postgres path, which bypasses RLS; enabling RLS with NO
-- permissive policy denies every other role (Supabase `anon` / `authenticated`)
-- without changing the app's enforced path. This table carries membership history,
-- so it must not be the one table readable through the public API.
ALTER TABLE member_group_change_requests ENABLE ROW LEVEL SECURITY;

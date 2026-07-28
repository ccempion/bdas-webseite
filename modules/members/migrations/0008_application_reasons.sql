-- Members module — application reasons and the groupless invariant (ADR 0031).
--
-- A membership application becomes a `NULL -> group` request row, so
-- `members.primary_group_id` is set only once a board has accepted the person.
-- Rejection records a reason on the request rather than flipping member status.

-- 1. The reason columns.
ALTER TABLE member_group_change_requests
  ADD COLUMN reason_category TEXT,
  ADD COLUMN reason_message  TEXT;

-- 2. Existing rejected transfers predate the reason requirement. Backfill them
--    before the constraint lands, or the constraint cannot be added.
UPDATE member_group_change_requests
   SET reason_category = 'other',
       reason_message  = 'Grund wurde vor Einführung der Begründungspflicht nicht erfasst.'
 WHERE status = 'rejected'
   AND reason_category IS NULL;

-- 3. A reason, when present, is one of the three keys, and `other` must say
--    something. The stronger rule — a reason exists exactly on rejections —
--    is deferred to 0009_reason_required.sql: the currently-deployed
--    decideGroupChange() rejects without setting reason_category, and
--    migrations here are applied by hand, decoupled from deploys. Landing
--    that constraint now would break every rejection until the service-layer
--    change ships, for as long as the gap between the two manual steps lasts.
ALTER TABLE member_group_change_requests
  ADD CONSTRAINT member_group_change_requests_reason_category_check
    CHECK (reason_category IS NULL
           OR reason_category IN ('no_contact', 'not_a_student', 'other'));

ALTER TABLE member_group_change_requests
  ADD CONSTRAINT member_group_change_requests_reason_other_check
    CHECK (reason_category IS DISTINCT FROM 'other' OR reason_message IS NOT NULL);

-- 4. Live applications: a pending member's group choice was never approved by
--    anyone, so it becomes a pending request and the column is cleared. The
--    original signup time is kept so nobody loses their place in the queue.
INSERT INTO member_group_change_requests
  (id, member_id, from_group_id, to_group_id, status, requested_at)
SELECT 'mgc_mig_' || m.id, m.id, NULL, m.primary_group_id, 'pending', m.created_at
  FROM members m
 WHERE m.status = 'pending'
   AND m.primary_group_id IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM member_group_change_requests r
          WHERE r.member_id = m.id AND r.status = 'pending'
       );

UPDATE members
   SET primary_group_id = NULL, updated_at = now()
 WHERE status = 'pending'
   AND primary_group_id IS NOT NULL;

-- 5. Rejected applicants. `joined_at` is stamped only on first acceptance, so
--    `inactive` with a null `joined_at` is someone who was refused and never was
--    a member. They are currently stranded: `inactive` only transitions to
--    `active`, and they may not apply anywhere. Return them to the pool and
--    record what happened to them.
INSERT INTO member_group_change_requests
  (id, member_id, from_group_id, to_group_id, status,
   requested_at, decided_at, decided_by, reason_category, reason_message)
SELECT 'mgc_rej_' || m.id, m.id, NULL, m.primary_group_id, 'rejected',
       m.created_at, m.updated_at, 'system', 'other',
       'Diese Entscheidung stammt aus der Zeit vor der Begründungspflicht.'
  FROM members m
 WHERE m.status = 'inactive'
   AND m.joined_at IS NULL
   AND m.primary_group_id IS NOT NULL;

-- Deliberately not guarded by `primary_group_id IS NOT NULL` like the INSERT
-- above it: a rejected applicant whose group has since disappeared (only
-- reachable via a manual deletion — the app only archives groups, never
-- deletes them) still gets freed from `inactive`. No request row can be
-- written for that case because `to_group_id` would have to be NULL, which
-- `member_group_change_requests_moves_check` (`from_group_id IS DISTINCT
-- FROM to_group_id`) forbids when `from_group_id` is also NULL. Freeing the
-- person is the point; the audit trail is simply inexpressible here.
UPDATE members
   SET status = 'pending', primary_group_id = NULL, updated_at = now()
 WHERE status = 'inactive'
   AND joined_at IS NULL;

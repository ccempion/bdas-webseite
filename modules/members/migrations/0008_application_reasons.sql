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

-- 3. A reason exists exactly on rejections, is one of the three keys, and
--    `other` must say something.
ALTER TABLE member_group_change_requests
  ADD CONSTRAINT member_group_change_requests_reason_presence_check
    CHECK ((status = 'rejected') = (reason_category IS NOT NULL));

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

UPDATE members
   SET status = 'pending', primary_group_id = NULL, updated_at = now()
 WHERE status = 'inactive'
   AND joined_at IS NULL;

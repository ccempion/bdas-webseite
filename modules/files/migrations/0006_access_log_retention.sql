-- 90-day file-access-log retention must survive account deletion (design
-- spec §2 decision 2, docs/superpowers/specs/2026-09-22-account-deletion-design.md).
-- member_id previously cascaded, so hard-deleting a member erased their
-- access history along with them, in conflict with the retention
-- requirement — regardless of who or what triggered the deletion. The log
-- entry now survives with member_id anonymized to NULL instead.

ALTER TABLE file_access_log ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE file_access_log DROP CONSTRAINT file_access_log_member_id_fkey;
ALTER TABLE file_access_log
  ADD CONSTRAINT file_access_log_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;

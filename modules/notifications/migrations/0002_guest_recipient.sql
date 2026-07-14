-- Notifications module — guest (non-member) recipients, Slice 4.
-- Transactional mail to event guests has no member_id; to_email carries the
-- recipient regardless, and the row is retained for audit.
ALTER TABLE notification_log ALTER COLUMN member_id DROP NOT NULL;

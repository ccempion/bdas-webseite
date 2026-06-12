-- Members module — revocation accountability (PR 5 security-review follow-up).
-- `revoked_by` records the auth user who revoked a grant; NULL while active
-- and for rows revoked before this migration (pre-production data only).
ALTER TABLE member_role_grants
  ADD COLUMN revoked_by text;

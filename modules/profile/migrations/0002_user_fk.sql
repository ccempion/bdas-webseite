-- GDPR erasure (ADR 0008, spec §503): deleting an identity must take the
-- extended profile with it. `member_profiles` held personal data — birth date,
-- university, referral, the private photo key — keyed by user_id with nothing
-- enforcing that link, so a deleted user left the row behind indefinitely.
--
-- `members.user_id` already carries exactly this constraint (members/0001), so
-- an FK across the module boundary is the established shape here, not a new
-- one. The Drizzle schema stays free of cross-module imports: the reference
-- lives in SQL only, as it does for members.

-- Any row whose user is already gone is orphaned personal data. Erase it before
-- the constraint goes on; without this the ALTER would fail on such a row.
DELETE FROM member_profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth_users u WHERE u.id = p.user_id);

ALTER TABLE member_profiles
  ADD CONSTRAINT member_profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

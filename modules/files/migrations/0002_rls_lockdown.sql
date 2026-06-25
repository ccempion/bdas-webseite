-- Files module — Row-Level Security lockdown (design docs/superpowers/specs/2026-06-25-files-consumer-experience-design.md).
-- The app reaches these tables only via the service-role / direct-Postgres path,
-- which bypasses Row-Level Security (table owner / BYPASSRLS role). Enabling RLS
-- with NO permissive policy denies every other role (Supabase `anon` and
-- `authenticated`), closing the documented security gate with zero change to the
-- app's enforced path. Re-runs are harmless (ENABLE is idempotent in effect).
ALTER TABLE folders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE files           ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_access_log ENABLE ROW LEVEL SECURITY;

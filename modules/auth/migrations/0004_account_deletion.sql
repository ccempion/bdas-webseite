-- Self-service account deletion (DSGVO Art. 17), 30-day grace period before
-- the hard purge. See docs/superpowers/specs/2026-09-22-account-deletion-design.md.
--
-- user_id is ON DELETE SET NULL, not CASCADE: the row must survive the
-- eventual hard delete (modules/auth's account-deletion-sweep.ts, a later
-- PR) as the audit trail, and to carry the snapshotted email/name for the
-- post-purge confirmation email once auth_users no longer has them.

CREATE TABLE account_deletion_requests (
  id text PRIMARY KEY,
  user_id text REFERENCES auth_users(id) ON DELETE SET NULL,
  email_snapshot text NOT NULL,
  name_snapshot text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_purge_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reactivation_token text,
  reactivation_expires_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX account_deletion_requests_user_idx ON account_deletion_requests(user_id);
CREATE INDEX account_deletion_requests_status_idx ON account_deletion_requests(status, scheduled_purge_at);
CREATE UNIQUE INDEX account_deletion_requests_reactivation_token_idx
  ON account_deletion_requests(reactivation_token) WHERE reactivation_token IS NOT NULL;

-- Per-module purge progress, so a retried cron sweep can skip modules it
-- already finished instead of re-running a destructive step (PR8).
CREATE TABLE account_deletion_steps (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES account_deletion_requests(id) ON DELETE CASCADE,
  module_name text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, module_name)
);

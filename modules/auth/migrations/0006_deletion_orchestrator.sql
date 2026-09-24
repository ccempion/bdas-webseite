-- Deletion orchestrator (PR8): the sweep runs on overlapping cron ticks and
-- must be safe to retry, so a request carries a lease (claimed_until) that
-- stops two ticks from purging the same account, and last_error so a stuck
-- request is diagnosable without log archaeology.
--
-- The snapshots become nullable because they are personal data that has no
-- reason to outlive the confirmation email (e-mail C); the orchestrator
-- clears them once it is sent, leaving only the audit row.
--
-- Additive/relaxing only: this is applied to production automatically.

ALTER TABLE account_deletion_requests
  ADD COLUMN claimed_until timestamptz,
  ADD COLUMN last_error text,
  ALTER COLUMN email_snapshot DROP NOT NULL,
  ALTER COLUMN name_snapshot DROP NOT NULL;

-- Groups module — enforce the status domain at the DB.
-- App-layer zod validation is bypassable (seed CLI, manual SQL, a future
-- service that forgets to validate); a CHECK keeps the column honest so the
-- public {status:'active'} filter and groups_status_idx never see garbage.
-- A CHECK (not a Postgres enum) is used deliberately: the status set is still
-- moving and a constraint is a one-line drop+recreate to evolve.

ALTER TABLE groups
  ADD CONSTRAINT groups_status_check
  CHECK (status IN ('active', 'dormant', 'new', 'archived'));

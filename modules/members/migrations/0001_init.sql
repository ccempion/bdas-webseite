-- Members module — initial schema.
-- Phase 1 columns only; group_change_requests deferred to Phase 6 per the spec.

CREATE TABLE members (
  id                text PRIMARY KEY,
  user_id           text NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE,
  first_name        text NOT NULL,
  last_name         text NOT NULL,
  primary_group_id  text REFERENCES groups(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'pending',
  roles             text[] NOT NULL DEFAULT '{}',
  joined_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX members_status_idx ON members(status);
CREATE INDEX members_group_idx  ON members(primary_group_id);

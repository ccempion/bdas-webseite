-- Auth — self-service login-email change.
--
-- A pending change is a single-use token that binds a user to a proposed
-- new email address. The address only lands in auth_users.email_normalized
-- once the token is confirmed via the link mailed to that new address.

CREATE TABLE auth_email_changes (
  token text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  new_email_normalized text NOT NULL,
  new_email_display text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_email_changes_user_idx ON auth_email_changes(user_id);
CREATE INDEX auth_email_changes_new_email_idx ON auth_email_changes(new_email_normalized);

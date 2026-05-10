-- Auth module — initial schema.
-- Owned tables: auth_users, auth_credentials, auth_sessions,
-- auth_email_verifications, auth_password_resets, auth_rate_limits.

CREATE TABLE auth_users (
  id text PRIMARY KEY,
  email_normalized text NOT NULL UNIQUE,
  email_display text NOT NULL,
  status text NOT NULL DEFAULT 'unverified',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_credentials (
  user_id text PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  hashed_password text NOT NULL,
  algorithm text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expires_idx ON auth_sessions(expires_at);

CREATE TABLE auth_email_verifications (
  token text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_email_verifications_user_idx ON auth_email_verifications(user_id);

CREATE TABLE auth_password_resets (
  token text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_password_resets_user_idx ON auth_password_resets(user_id);

CREATE TABLE auth_rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

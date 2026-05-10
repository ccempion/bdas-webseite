-- Groups module — initial schema.
-- Phase 1 columns only. join_fee_* lands in Phase 6 per the spec.

CREATE TABLE groups (
  id              text PRIMARY KEY,
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  city            text NOT NULL,
  university      text,
  description     text,
  contact_email   text,
  instagram_url   text,
  website_url     text,
  status          text NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX groups_status_idx ON groups(status);

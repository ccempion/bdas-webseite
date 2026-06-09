-- Notifications module — initial schema (spec §16, Phase 2 core slice).
-- Owns: notification_log.
-- FKs into members(id) (DB-level reference, same pattern as events → members).
-- Runs after members per the infra/migrations manifest.

CREATE TABLE notification_log (
  id          text PRIMARY KEY,
  member_id   text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  channel     text NOT NULL DEFAULT 'email',
  template    text NOT NULL,
  to_email    text NOT NULL,
  subject     text NOT NULL,
  status      text NOT NULL,            -- 'sent' | 'failed'
  error       text,                     -- failure detail when status = 'failed'
  event_id    text,                     -- optional correlation to the source bus event
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_log_status_chk CHECK (status IN ('sent', 'failed'))
);

CREATE INDEX notification_log_member_idx ON notification_log (member_id);
CREATE INDEX notification_log_created_idx ON notification_log (created_at);

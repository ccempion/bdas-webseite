-- Notifications module — broadcast history for the admin UI.
-- Owns: event_broadcast. One row per organizer broadcast (sendOrganizerMessage
-- call), distinct from notification_log which is per-recipient. No FK into
-- events(id): this module never reads the events tables directly (rule 1).

CREATE TABLE event_broadcast (
  id               text PRIMARY KEY,
  event_id         text NOT NULL,
  subject          text NOT NULL,
  body             text NOT NULL,
  recipient_count  integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_broadcast_event_created_idx ON event_broadcast (event_id, created_at);

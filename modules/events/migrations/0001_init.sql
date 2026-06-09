-- Events module — initial schema (spec §10, Phase 2 core slice).
-- Owns: events, event_registrations, event_attendance.
-- FKs into groups(id) and members(id) (DB-level references, same pattern as
-- members → auth_users/groups). Runs after groups + members per the manifest.

CREATE TABLE events (
  id              text PRIMARY KEY,
  group_id        text REFERENCES groups(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description_md  text,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz,
  location        text,
  location_url    text,
  capacity        integer,
  visibility      text NOT NULL DEFAULT 'members_only',
  status          text NOT NULL DEFAULT 'draft',
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_visibility_check
    CHECK (visibility IN ('public', 'members_only', 'group_only')),
  CONSTRAINT events_status_check
    CHECK (status IN ('draft', 'published', 'cancelled')),
  CONSTRAINT events_capacity_check CHECK (capacity IS NULL OR capacity > 0),
  CONSTRAINT events_time_check CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX events_status_starts_idx ON events(status, starts_at);
CREATE INDEX events_group_idx ON events(group_id);

CREATE TABLE event_registrations (
  id                text PRIMARY KEY,
  event_id          text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id         text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  registered_at     timestamptz NOT NULL DEFAULT now(),
  cancelled_at      timestamptz,
  -- NULL = confirmed; >= 1 = waitlisted at that rank.
  waitlist_position integer
);
-- One active (non-cancelled) registration per member per event.
CREATE UNIQUE INDEX event_registrations_active_uq
  ON event_registrations (event_id, member_id)
  WHERE cancelled_at IS NULL;
CREATE INDEX event_registrations_event_idx
  ON event_registrations (event_id)
  WHERE cancelled_at IS NULL;

CREATE TABLE event_attendance (
  id            text PRIMARY KEY,
  event_id      text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id     text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  attended      boolean NOT NULL DEFAULT false,
  checked_in_at timestamptz,
  checked_in_by text
);
CREATE UNIQUE INDEX event_attendance_uq ON event_attendance (event_id, member_id);

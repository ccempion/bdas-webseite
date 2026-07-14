-- Events module — guest (non-member) registration, Slice 4.
-- Opt-in per event; a registration is either a member OR a guest, never both.

-- Per-event opt-in. Only meaningful for publicly viewable events (enforced in
-- the service/editor, not at the DB level).
ALTER TABLE events
  ADD COLUMN allow_guest_registration boolean NOT NULL DEFAULT false;

-- A guest registration carries name + email and a single-use self-cancel token
-- instead of a member_id. member_id therefore becomes nullable, and a CHECK
-- enforces exactly one of {member_id, guest_email}.
ALTER TABLE event_registrations ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE event_registrations ADD COLUMN guest_name text;
ALTER TABLE event_registrations ADD COLUMN guest_email text;
ALTER TABLE event_registrations ADD COLUMN guest_cancel_token text;

ALTER TABLE event_registrations
  ADD CONSTRAINT event_registrations_member_xor_guest
  CHECK ((member_id IS NOT NULL) <> (guest_email IS NOT NULL));

-- One active (non-cancelled) registration per guest email per event,
-- case-insensitive. (NULL member_ids are distinct, so the existing member
-- unique index keeps working unchanged.)
CREATE UNIQUE INDEX event_registrations_guest_active_uq
  ON event_registrations (event_id, lower(guest_email))
  WHERE guest_email IS NOT NULL AND cancelled_at IS NULL;

-- The self-cancel token is looked up on the public cancel route; unique so the
-- lookup is unambiguous. Retained after cancellation (the link 404s on an
-- already-cancelled row via the cancelled_at filter, not via token reuse).
CREATE UNIQUE INDEX event_registrations_guest_token_uq
  ON event_registrations (guest_cancel_token)
  WHERE guest_cancel_token IS NOT NULL;

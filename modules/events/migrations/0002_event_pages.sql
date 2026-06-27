-- Events module — proper event pages (Slice 1).
-- Additive only. description_md is retained (deprecated, unused) and backfilled
-- into content.body; a later cleanup migration drops it (ADR 0010 deploy safety).

ALTER TABLE events ADD COLUMN content jsonb;
ALTER TABLE events ADD COLUMN cover_image_key text;
ALTER TABLE events ADD COLUMN summary text;
ALTER TABLE events ADD COLUMN registration_deadline timestamptz;
ALTER TABLE events ADD COLUMN location_name text;
ALTER TABLE events ADD COLUMN location_address text;
ALTER TABLE events ADD COLUMN location_lat double precision;
ALTER TABLE events ADD COLUMN location_lng double precision;

-- Backfill: wrap existing plain-text description into a minimal Tiptap doc at
-- content.body so no copy is lost. Empty/whitespace descriptions stay NULL.
UPDATE events
SET content = jsonb_build_object(
  'body',
  jsonb_build_object(
    'type', 'doc',
    'content', jsonb_build_array(
      jsonb_build_object(
        'type', 'paragraph',
        'content', jsonb_build_array(
          jsonb_build_object('type', 'text', 'text', description_md)
        )
      )
    )
  )
)
WHERE description_md IS NOT NULL AND btrim(description_md) <> '';

-- Carry freeform location text into the new structured name field.
UPDATE events
SET location_name = location
WHERE location IS NOT NULL AND btrim(location) <> '';

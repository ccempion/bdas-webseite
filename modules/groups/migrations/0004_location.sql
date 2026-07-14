-- Optional meeting-point location per group (spec 2026-07-06 group map).
-- name/address are editor-facing only; lat/lng feed the public map.
ALTER TABLE groups
  ADD COLUMN location_name text,
  ADD COLUMN location_address text,
  ADD COLUMN location_lat double precision,
  ADD COLUMN location_lng double precision,
  ADD CONSTRAINT groups_location_pair_check
    CHECK ((location_lat IS NULL) = (location_lng IS NULL));

-- Groups module — drop `university` and `description`.
-- Product decision (ADR 0006): a group belongs to a city, not a single
-- university (cities host several), and a freitext description is not wanted.
-- Removed from the data model entirely rather than left as dead columns.

ALTER TABLE groups DROP COLUMN IF EXISTS university;
ALTER TABLE groups DROP COLUMN IF EXISTS description;

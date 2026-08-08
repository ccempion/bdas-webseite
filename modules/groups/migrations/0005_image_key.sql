-- Banner image for the public group page (#62). Stores an opaque storage key
-- in the public `content-media` bucket; the app layer turns it into a URL.
ALTER TABLE groups ADD COLUMN image_key text;

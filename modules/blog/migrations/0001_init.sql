-- Blog module — initial schema.
-- Owns: posts.
-- Runs after members per the manifest. created_by is a plain auth-user id with
-- no FK (matches events). Body is Tiptap JSON; visibility is enforced in the
-- service/app layer (see src/visibility.ts) and constrained here.

CREATE TABLE posts (
  id            text PRIMARY KEY,
  slug          text NOT NULL UNIQUE,
  title         text NOT NULL,
  content       jsonb NOT NULL,
  visibility    text NOT NULL DEFAULT 'public',
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posts_visibility_check
    CHECK (visibility IN ('public', 'members', 'board'))
);

-- Feed: newest-first, filtered by visibility.
CREATE INDEX posts_created_at_idx  ON posts(created_at);
CREATE INDEX posts_visibility_idx  ON posts(visibility);
CREATE INDEX posts_author_idx      ON posts(created_by);

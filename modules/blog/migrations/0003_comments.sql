-- Blog module — member comments on posts (spec 2026-08-08, ADR 0033).
-- Flat (no threading), plain text, member-and-alumni only. `deleted_at` is the
-- moderation soft delete, matching posts; erasure on account deletion is a
-- hard DELETE instead (see deleteCommentsByAuthor).

CREATE TABLE post_comments (
  id          text PRIMARY KEY,
  post_id     text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id   text NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT post_comments_body_length CHECK (char_length(body) BETWEEN 1 AND 1000)
);

CREATE INDEX post_comments_post_idx   ON post_comments(post_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX post_comments_author_idx ON post_comments(author_id, created_at);

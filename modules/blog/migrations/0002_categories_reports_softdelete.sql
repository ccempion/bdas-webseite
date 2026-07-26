-- Blog module — categories, soft-delete, and reports.
-- Adds `category` (fixed enum) + `deleted_at` (soft-delete marker) to posts,
-- and a new post_reports table for the member-reporting abuse flow.

ALTER TABLE posts
  ADD COLUMN category text NOT NULL DEFAULT 'sonstiges',
  ADD COLUMN deleted_at timestamptz;

ALTER TABLE posts
  ADD CONSTRAINT posts_category_check
    CHECK (category IN (
      'verbandsintern', 'gruppenleben', 'veranstaltungsrueckblick',
      'politik_positionen', 'karriere_weiterbildung', 'sonstiges'
    ));

CREATE INDEX posts_category_idx    ON posts(category);
CREATE INDEX posts_deleted_at_idx  ON posts(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE post_reports (
  id            text PRIMARY KEY,
  post_id       text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_id   text NOT NULL,
  reason        text,
  status        text NOT NULL DEFAULT 'open',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_reports_status_check
    CHECK (status IN ('open', 'dismissed'))
);

CREATE INDEX post_reports_status_idx   ON post_reports(status);
CREATE INDEX post_reports_post_id_idx  ON post_reports(post_id);

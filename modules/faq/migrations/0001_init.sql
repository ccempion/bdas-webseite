-- FAQ module — board-editable FAQ entries, topics, contexts, feedback,
-- submissions (docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md).
-- User references are plain auth-user ids, no cross-module FK (blog precedent).

CREATE TABLE faq_topics (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0
);

CREATE TABLE faq_entries (
  id          text PRIMARY KEY,
  section     text NOT NULL CHECK (section IN ('allgemein','bundesvorstand','vorstand','mitglieder')),
  subgroup    text CHECK (subgroup IN ('local_board_lead','local_board','event_organizer','page_editor')),
  topic_id    text REFERENCES faq_topics(id) ON DELETE SET NULL,
  question    text NOT NULL,
  body        jsonb NOT NULL,
  youtube_id  text,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

CREATE TABLE faq_entry_links (
  entry_id          text NOT NULL REFERENCES faq_entries(id) ON DELETE CASCADE,
  related_entry_id  text NOT NULL REFERENCES faq_entries(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, related_entry_id),
  CHECK (entry_id <> related_entry_id)
);

CREATE TABLE faq_entry_contexts (
  entry_id  text NOT NULL REFERENCES faq_entries(id) ON DELETE CASCADE,
  context   text NOT NULL,
  PRIMARY KEY (entry_id, context)
);

CREATE TABLE faq_feedback (
  entry_id    text NOT NULL REFERENCES faq_entries(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  helpful     boolean NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, user_id)
);

CREATE TABLE faq_submissions (
  id            text PRIMARY KEY,
  question      text NOT NULL,
  details       text,
  context       text,
  submitted_by  text NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','discarded')),
  entry_id      text REFERENCES faq_entries(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_by    text,
  decided_at    timestamptz
);

CREATE INDEX faq_entries_section_idx ON faq_entries (section, status, position);
CREATE INDEX faq_submissions_status_idx ON faq_submissions (status, created_at);

-- RLS lockdown: app reaches these tables only via the service-role /
-- direct-Postgres path (bypasses RLS). No permissive policy ⇒ Supabase
-- anon/authenticated denied.
ALTER TABLE faq_topics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_entry_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_entry_contexts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_feedback        ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_submissions     ENABLE ROW LEVEL SECURITY;

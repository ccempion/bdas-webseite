-- Projects module — initial schema (spec §12).
-- Owns: projects. (project_updates lands in a follow-up PR.)
-- FK into groups(id) (DB-level reference, same pattern as events → groups).
-- Runs after groups per the manifest. created_by is a plain member/user id
-- with no FK (matches events).

CREATE TABLE projects (
  id                       text PRIMARY KEY,
  group_id                 text NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title                    text NOT NULL,
  description_md           text,
  status                   text NOT NULL DEFAULT 'active',
  topic                    text,
  contact                  text,
  -- References to files already stored via @bdas/files (no parallel storage).
  artifact_file_ids        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Provenance for "Adopt this project" copies; null for originals.
  adopted_from_project_id  text REFERENCES projects(id) ON DELETE SET NULL,
  created_by               text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_status_check
    CHECK (status IN ('planned', 'active', 'completed', 'archived'))
);

CREATE INDEX projects_group_idx ON projects(group_id);
CREATE INDEX projects_topic_idx ON projects(topic);

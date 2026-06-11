-- Files module — initial schema (spec §11, Phase 2).
-- Owns: folders, files, file_access_log.
-- Runs after members per infra/migrations/src/manifest.ts (folders FK groups+members).

CREATE TABLE folders (
  id           text PRIMARY KEY,
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  scope        text NOT NULL,
  group_id     text REFERENCES groups(id) ON DELETE CASCADE,
  description  text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text REFERENCES members(id) ON DELETE SET NULL,

  CONSTRAINT folders_scope_chk CHECK (
    scope IN ('members_all', 'group_members', 'local_board', 'federal_board')
  ),
  -- group_id required for group-scoped folders, null for the two singletons
  CONSTRAINT folders_scope_group_chk CHECK (
    (scope IN ('group_members', 'local_board') AND group_id IS NOT NULL)
    OR (scope IN ('members_all', 'federal_board') AND group_id IS NULL)
  ),
  -- one folder per (scope, group) — makes ensureFolders an idempotent upsert
  CONSTRAINT folders_scope_group_uq UNIQUE (scope, group_id)
);

CREATE TABLE files (
  id                text PRIMARY KEY,
  folder_id         text NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  filename          text NOT NULL,
  storage_key       text NOT NULL UNIQUE,
  mime_type         text NOT NULL,
  size_bytes        bigint NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  uploaded_by       text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  last_modified_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT files_status_chk CHECK (status IN ('pending', 'ready'))
);

CREATE INDEX files_folder_idx ON files (folder_id);
CREATE INDEX files_status_idx ON files (status);

-- Audit log. file_id is ON DELETE SET NULL so a deleted file does not erase the
-- access trail (who/what/when survive); member_id cascades with GDPR deletion.
CREATE TABLE file_access_log (
  id         text PRIMARY KEY,
  file_id    text REFERENCES files(id) ON DELETE SET NULL,
  member_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  action     text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT file_access_log_action_chk CHECK (action IN ('download', 'upload', 'delete'))
);

CREATE INDEX file_access_log_file_idx ON file_access_log (file_id);
CREATE INDEX file_access_log_member_idx ON file_access_log (member_id);

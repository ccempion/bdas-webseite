-- Content module — board-editable pages stored as Puck JSON documents
-- (design docs/superpowers/specs/2026-07-14-content-pages-design.md, ADR 0023).

CREATE TABLE content_pages (
  slug        text PRIMARY KEY,
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text NOT NULL
);

-- RLS lockdown: the app reaches this table only via the service-role /
-- direct-Postgres path (bypasses RLS). No permissive policy ⇒ Supabase
-- `anon` and `authenticated` roles are denied. ENABLE is idempotent.
ALTER TABLE content_pages ENABLE ROW LEVEL SECURITY;

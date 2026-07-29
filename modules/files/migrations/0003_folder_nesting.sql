-- Files module — folder nesting (spec 2026-07-29, decisions D1-D5).
--
-- Subfolders inherit their parent's scope and group_id permanently. The
-- inheritance is denormalised onto every row so permissions.ts needs no
-- knowledge of the tree: canRead/canWrite already answer correctly for a
-- folder at any depth. The trigger below is what keeps that denormalisation
-- honest.

ALTER TABLE folders ADD COLUMN parent_id text REFERENCES folders(id);
ALTER TABLE folders ADD COLUMN depth     int NOT NULL DEFAULT 0;

-- Every existing folder is a system-provisioned root; the defaults above are
-- already correct for them, so no backfill is required.

-- 1. One root per (scope, group). Was a plain UNIQUE that also caught
--    subfolders; now scoped to roots so a group may have many local_board
--    folders in its tree but only one local_board ROOT.
ALTER TABLE folders DROP CONSTRAINT folders_scope_group_uq;
CREATE UNIQUE INDEX folders_root_scope_group_uq
  ON folders (scope, group_id) WHERE parent_id IS NULL;

-- 2. Slug was globally UNIQUE, which would forbid "protokolle" under two
--    different parents. Split into root-global and per-parent.
--    The root index is load-bearing for ensureFolders' idempotency: a UNIQUE
--    on (scope, group_id) does NOT protect the two singletons, because
--    Postgres treats NULL group_id values as distinct. The slug index is what
--    makes re-running ensureFolders a no-op.
ALTER TABLE folders DROP CONSTRAINT folders_slug_key;
CREATE UNIQUE INDEX folders_root_slug_uq
  ON folders (slug) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX folders_sibling_slug_uq
  ON folders (parent_id, slug) WHERE parent_id IS NOT NULL;

CREATE INDEX folders_parent_idx ON folders (parent_id);

-- 3. Inheritance + depth invariant. A CHECK cannot read the parent row, so
--    this is a trigger. Messages are German: they surface to boards if a
--    service ever forgets its own validation.
CREATE OR REPLACE FUNCTION folders_inherit_check() RETURNS trigger AS $$
DECLARE
  p_scope text;
  p_group text;
  p_depth int;
BEGIN
  IF NEW.parent_id IS NULL THEN
    IF NEW.depth <> 0 THEN
      RAISE EXCEPTION 'Ordner ohne Elternordner muss Tiefe 0 haben.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Ein Ordner kann nicht sein eigener Elternordner sein.';
  END IF;

  SELECT scope, group_id, depth INTO p_scope, p_group, p_depth
    FROM folders WHERE id = NEW.parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Elternordner nicht gefunden.';
  END IF;

  IF NEW.scope IS DISTINCT FROM p_scope OR NEW.group_id IS DISTINCT FROM p_group THEN
    RAISE EXCEPTION 'Unterordner erbt Sichtbarkeit und Gruppe vom Elternordner.';
  END IF;

  IF NEW.depth <> p_depth + 1 THEN
    RAISE EXCEPTION 'Ungültige Tiefe für diesen Unterordner.';
  END IF;

  IF NEW.depth > 5 THEN
    RAISE EXCEPTION 'Maximale Ordnertiefe (5) überschritten.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER folders_inherit_trg
  BEFORE INSERT OR UPDATE ON folders
  FOR EACH ROW EXECUTE FUNCTION folders_inherit_check();

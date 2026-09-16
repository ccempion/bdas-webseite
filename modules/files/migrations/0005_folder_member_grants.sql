-- Files module — Ordnerfreigabe pro Person (Spec 2026-09-16 §5.3).
--
-- Die fünf Scopes beantworten „welche Gruppe, welches Gremium". Sie
-- beantworten nicht „diese eine Person darf in diesen einen Ordner" — das
-- braucht die genehmigte BDAJ-Spec für Funktionär*innen, die mit einzelnen
-- Hochschulgruppen zusammenarbeiten.
--
-- Vergeben darf nur der Bundesvorstand. Eine Freigabe ergänzt die Scope-Regel,
-- sie ersetzt sie nie, und sie gilt wie jede Ordnerberechtigung auch für die
-- Unterordner. member_id ist ohne FK: members gehört einem anderen Modul
-- (CLAUDE.md §1 Regel 1); der Dienst prüft die Person über @bdas/members.

CREATE TABLE folder_member_grants (
  id          text PRIMARY KEY,
  folder_id   text NOT NULL REFERENCES folders (id) ON DELETE CASCADE,
  member_id   text NOT NULL,
  can_write   boolean NOT NULL DEFAULT false,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  text NOT NULL,
  revoked_at  timestamptz,
  revoked_by  text
);

-- Eine offene Freigabe je (Ordner, Person); widerrufene Zeilen bleiben als
-- Protokoll liegen.
CREATE UNIQUE INDEX folder_member_grants_open_idx
  ON folder_member_grants (folder_id, member_id)
  WHERE revoked_at IS NULL;

CREATE INDEX folder_member_grants_member_idx
  ON folder_member_grants (member_id)
  WHERE revoked_at IS NULL;

-- Wie 0002_rls_lockdown.sql: ohne Richtlinie sperrt RLS anon/authenticated
-- aus; der Dienstweg der App umgeht RLS.
ALTER TABLE folder_member_grants ENABLE ROW LEVEL SECURITY;

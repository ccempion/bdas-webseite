-- Groups module — die Art einer Gruppe als Achse.
--
-- Bis hierher war jede Gruppe eine Hochschulgruppe. Mit `kind` bekommt die
-- Plattform eine Achse für Accounts, deren Zuhause keine Hochschulgruppe ist:
-- BDAJ-Funktionär*innen und weitere Partnerorganisationen (Spec
-- 2026-09-12-nutzertypen-fundament-design.md §3, auf Grundlage der
-- genehmigten BDAJ-Spec vom 2026-09-07).
--
-- `netzwerk` (Interessierte ohne Hochschulgruppe) fehlt hier bewusst: ein
-- Enum-Wert ohne Zeilen und ohne Code wäre eine spekulative Abstraktion
-- (CLAUDE.md §6). Er kostet eine Migrationszeile, wenn seine Spec kommt.

ALTER TABLE groups
  ADD COLUMN kind text NOT NULL DEFAULT 'hochschulgruppe';

-- Wie groups_status_check: ein CHECK statt eines Postgres-Enums hält die
-- Wertemenge gegen Seed-Skripte und Handarbeit ehrlich und bleibt ein
-- einzeiliges drop+recreate, wenn eine Art dazukommt.
ALTER TABLE groups
  ADD CONSTRAINT groups_kind_check
  CHECK (kind IN ('hochschulgruppe', 'affiliate'));

-- Eine Partnerorganisation hat keine Stadt — sie ist nicht verortet. Eine
-- Hochschulgruppe hat immer eine; das war bis hierher durch NOT NULL
-- abgesichert und bleibt es, nur jetzt abhängig von der Art.
ALTER TABLE groups ALTER COLUMN city DROP NOT NULL;

ALTER TABLE groups
  ADD CONSTRAINT groups_kind_city_check
  CHECK (
    (kind = 'hochschulgruppe' AND city IS NOT NULL)
    OR (kind <> 'hochschulgruppe' AND city IS NULL)
  );

-- Groups module — dritte Gruppenart: netzwerk.
--
-- Zuhause für Accounts ohne Anspruch auf Mitgliedschaft: Förderer*innen,
-- Referent*innen, Einzelpersonen bei Partnerorganisationen (Spec
-- 2026-09-16-nutzertypen-fundament-ii-design.md §3). `affiliate` bleibt, was es
-- ist: eine Partnerorganisation als Organisation (BDAJ).
--
-- Der Stadt-Constraint aus 0007 trägt den neuen Wert unverändert mit: nur eine
-- Hochschulgruppe ist verortet.

ALTER TABLE groups DROP CONSTRAINT groups_kind_check;

ALTER TABLE groups
  ADD CONSTRAINT groups_kind_check
  CHECK (kind IN ('hochschulgruppe', 'affiliate', 'netzwerk'));

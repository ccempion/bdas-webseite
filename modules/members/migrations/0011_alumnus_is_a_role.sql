-- Members module — Alumnus ist eine Rolle, kein Status (ADR 0043).
--
-- `alumnus` existierte doppelt: als MemberStatus (aus dem effectiveGrants
-- einen ungescopten Grant ableitete) und als regulär vergebbare Role in
-- member_role_grants. Die Dublette wird hier aufgelöst — die Rolle bleibt,
-- der Status verschwindet.
--
-- `inactive` fällt mit: Migration 0008 (ADR 0031) hat den Wert geleert, indem
-- sie abgelehnte Bewerber*innen nach `pending` zurücksetzte. Was hier noch mit
-- `inactive` dasteht, ist per Definition ein ehemaliges Mitglied mit
-- gestempeltem joined_at — für das ist Alumnus die richtige Einordnung.

-- Schritt 1: verbliebene Alumni und Inaktive nach active, mit Grant-Zeile.
-- Der NOT-EXISTS-Guard und ON CONFLICT machen den Schritt idempotent: der
-- Guard fängt den Normalfall, ON CONFLICT den Sonderfall, dass jemand einen
-- bereits widerrufenen 'mrg_alum_'-Grant aus einem früheren Lauf trägt.
INSERT INTO member_role_grants (id, member_id, role, group_id, granted_at, granted_by)
SELECT 'mrg_alum_' || m.id, m.id, 'alumnus', m.primary_group_id, now(), 'system'
  FROM members m
 WHERE m.status IN ('alumnus', 'inactive')
   AND NOT EXISTS (
         SELECT 1 FROM member_role_grants g
          WHERE g.member_id = m.id AND g.role = 'alumnus' AND g.revoked_at IS NULL
       )
ON CONFLICT (id) DO NOTHING;

UPDATE members
   SET status = 'active', updated_at = now()
 WHERE status IN ('alumnus', 'inactive');

-- Schritt 2: members.status bekommt erstmals einen CHECK. Bis hierher lebten
-- die zulässigen Werte ausschließlich in TypeScript (0001_init.sql: reines
-- `text NOT NULL DEFAULT 'pending'`). Dass der Constraint jetzt greift, ist
-- zugleich die Zusicherung, dass Schritt 1 jede Zeile erwischt hat.
ALTER TABLE members
  ADD CONSTRAINT members_status_check
  CHECK (status IN ('pending', 'active'));

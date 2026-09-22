-- FAQ module — die beiden Alumni-Texte auf ADR 0043 ziehen.
--
-- `0002_seed.sql` hat den alten Stand eingespielt: Alumni seien keine aktiven
-- Mitglieder und dürften sich nicht zu Veranstaltungen anmelden. Seit ADR 0043
-- ist Alumnus eine reine Kennzeichnung ohne Einschränkung. Die Seed-Datei
-- selbst bleibt unangetastet — sie ist in Produktion bereits angewendet.
--
-- Nur Zeilen, die niemand im Editor angefasst hat (`updated_by IS NULL`) und
-- die den alten Text noch tragen: eine Änderung des Bundesvorstands wird nie
-- überschrieben, und ein zweiter Lauf ändert nichts.

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Alumni: ausgeschiedenes Mitglied; meldet sich nicht mehr für Veranstaltungen an, kann aber weiterhin Blog-Beiträge verfassen.',
         'Alumni: ehemaliges Mitglied; eine Kennzeichnung, keine Einschränkung. Du meldest dich weiter zu Veranstaltungen an wie jedes Mitglied.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'rollenmodell'
   AND updated_by IS NULL
   AND body::text LIKE '%Alumni: ausgeschiedenes Mitglied; meldet sich nicht mehr für Veranstaltungen an%';

UPDATE faq_entries
   SET body = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Wenig. Du bleibst aktives Mitglied im BDAS-Netzwerk und kannst dich weiterhin zu Veranstaltungen anmelden. In der Mitgliederliste deiner Hochschulgruppe bist du als Alumnus gekennzeichnet. Das ist eine Einordnung, keine Einschränkung. Ob du Blog-Beiträge verfassen kannst, hängt wie bei allen anderen an deiner Rolle, nicht an dieser Kennzeichnung."}]}]}'::jsonb,
       updated_at = now()
 WHERE id = 'alumni'
   AND updated_by IS NULL
   AND body::text LIKE '%Als Alumni giltst du nicht mehr als aktives Mitglied%';

-- FAQ module — Gedankenstriche in bereits eingespielten Seed-Zeilen entfernen (PR E).
--
-- `0002_seed.sql` und `0003_alumni_text.sql` sind in Produktion bereits angewendet
-- und bleiben als historischer Stand unangetastet (siehe deren eigene Kommentare).
-- PR E hat den lebenden Quelltext in apps/web/content/faq und die beiden SQL-Dateien
-- auf Komma/Doppelpunkt/Punkt statt langer Gedankenstriche umgestellt; diese Migration
-- zieht bereits eingespielte Zeilen auf denselben Text nach.
--
-- Wie in 0003: jede UPDATE-Anweisung matcht auf den bisherigen (noch mit Gedankenstrich
-- versehenen) Textausschnitt und ist an `updated_by IS NULL` gebunden, eine Änderung des
-- Bundesvorstands im Editor wird nie überschrieben. Jede Anweisung ist einzeln idempotent:
-- nach dem ersten Lauf enthält die Zeile den alten Ausschnitt nicht mehr, ein zweiter Lauf
-- oder eine frische Datenbank (die den Text bereits korrekt aus 0002/0003 erbt, siehe unten)
-- treffen die WHERE-Klausel nicht mehr und bleiben No-ops.
--
-- Sonderfall Alumni-Zeilen: `0003_alumni_text.sql` hat in Produktion bereits den ADR-0043-
-- Text eingespielt, allerdings noch mit Gedankenstrich (0003 wurde erst in dieser PR auf
-- Doppelpunkt/Punkt umgestellt, das wirkt sich aber nur auf frische Datenbanken aus, nicht
-- rückwirkend). Die beiden Alumni-Anweisungen unten matchen deshalb auf den bereits
-- migrierten (Gedankenstrich-)Text, nicht auf den ursprünglichen Vor-ADR-0043-Text.

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Die Bestätigungs-E-Mail öffnen und den Verifizierungslink anklicken — die Verifizierung ist Pflicht, bevor Rollen vergeben werden können.',
         'Die Bestätigungs-E-Mail öffnen und den Verifizierungslink anklicken. Die Verifizierung ist Pflicht, bevor Rollen vergeben werden können.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'registrierung-login'
   AND updated_by IS NULL
   AND body::text LIKE '%Die Bestätigungs-E-Mail öffnen und den Verifizierungslink anklicken — die Verifizierung ist Pflicht, bevor Rollen vergeben werden können.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Mitglied — registriertes, aktives Mitglied einer Hochschulgruppe.',
         'Mitglied: registriertes, aktives Mitglied einer Hochschulgruppe.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'rollenmodell'
   AND updated_by IS NULL
   AND body::text LIKE '%Mitglied — registriertes, aktives Mitglied einer Hochschulgruppe.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Vorstand (Lokaler Vorstand) — verwaltet die eigene Gruppe.',
         'Vorstand (Lokaler Vorstand): verwaltet die eigene Gruppe.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'rollenmodell'
   AND updated_by IS NULL
   AND body::text LIKE '%Vorstand (Lokaler Vorstand) — verwaltet die eigene Gruppe.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'LEAD — höchste Vertrauensrolle einer Gruppe; darf Rollen in der Gruppe vergeben.',
         'LEAD: höchste Vertrauensrolle einer Gruppe; darf Rollen in der Gruppe vergeben.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'rollenmodell'
   AND updated_by IS NULL
   AND body::text LIKE '%LEAD — höchste Vertrauensrolle einer Gruppe; darf Rollen in der Gruppe vergeben.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Event Organisator — darf Veranstaltungen der Gruppe verwalten.',
         'Event Organisator: darf Veranstaltungen der Gruppe verwalten.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'rollenmodell'
   AND updated_by IS NULL
   AND body::text LIKE '%Event Organisator — darf Veranstaltungen der Gruppe verwalten.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Seiten Editor — darf die öffentliche Gruppenseite bearbeiten.',
         'Seiten Editor: darf die öffentliche Gruppenseite bearbeiten.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'rollenmodell'
   AND updated_by IS NULL
   AND body::text LIKE '%Seiten Editor — darf die öffentliche Gruppenseite bearbeiten.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Bundesvorstand — föderationsweite Verwaltung über alle Gruppen.',
         'Bundesvorstand: föderationsweite Verwaltung über alle Gruppen.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'rollenmodell'
   AND updated_by IS NULL
   AND body::text LIKE '%Bundesvorstand — föderationsweite Verwaltung über alle Gruppen.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Alumni — ehemaliges Mitglied; eine Kennzeichnung, keine Einschränkung.',
         'Alumni: ehemaliges Mitglied; eine Kennzeichnung, keine Einschränkung.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'rollenmodell'
   AND updated_by IS NULL
   AND body::text LIKE '%Alumni — ehemaliges Mitglied; eine Kennzeichnung, keine Einschränkung.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Wer mehrere Zuständigkeiten hat (z. B. LEAD einer Gruppe und Bundesvorstand), wechselt oben in der Seitenleiste des Dashboards über den Bereichs-Umschalter zwischen den Ansichten — die URL musst du dafür nicht wechseln.',
         'Wer mehrere Zuständigkeiten hat (z. B. LEAD einer Gruppe und Bundesvorstand), wechselt oben in der Seitenleiste des Dashboards über den Bereichs-Umschalter zwischen den Ansichten. Die URL musst du dafür nicht wechseln.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'scope-switcher'
   AND updated_by IS NULL
   AND body::text LIKE '%Wer mehrere Zuständigkeiten hat (z. B. LEAD einer Gruppe und Bundesvorstand), wechselt oben in der Seitenleiste des Dashboards über den Bereichs-Umschalter zwischen den Ansichten — die URL musst du dafür nicht wechseln.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Unter „Mein Konto“ verwaltest du deine Zugangsdaten und deine E-Mail-Präferenzen — also welche Benachrichtigungskategorien du erhalten möchtest.',
         'Unter „Mein Konto“ verwaltest du deine Zugangsdaten und deine E-Mail-Präferenzen, also welche Benachrichtigungskategorien du erhalten möchtest.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'account-praeferenzen'
   AND updated_by IS NULL
   AND body::text LIKE '%Unter „Mein Konto“ verwaltest du deine Zugangsdaten und deine E-Mail-Präferenzen — also welche Benachrichtigungskategorien du erhalten möchtest.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Die Übersicht zeigt die föderationsweiten Kennzahlen: aktive Mitglieder, Neuanmeldungen der letzten 30 Tage, Anzahl aktiver Gruppen und anstehende Veranstaltungen — dazu einen Verlaufs-Chart der Anmeldungen.',
         'Die Übersicht zeigt die föderationsweiten Kennzahlen: aktive Mitglieder, Neuanmeldungen der letzten 30 Tage, Anzahl aktiver Gruppen und anstehende Veranstaltungen, dazu einen Verlaufs-Chart der Anmeldungen.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'overview'
   AND updated_by IS NULL
   AND body::text LIKE '%Die Übersicht zeigt die föderationsweiten Kennzahlen: aktive Mitglieder, Neuanmeldungen der letzten 30 Tage, Anzahl aktiver Gruppen und anstehende Veranstaltungen — dazu einen Verlaufs-Chart der Anmeldungen.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Archivierte Gruppen verwaltet nur noch der Bundesvorstand — ein lokaler Vorstand kann sie nicht mehr bearbeiten.',
         'Archivierte Gruppen verwaltet nur noch der Bundesvorstand. Ein lokaler Vorstand kann sie nicht mehr bearbeiten.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'gruppen-verwalten'
   AND updated_by IS NULL
   AND body::text LIKE '%Archivierte Gruppen verwaltet nur noch der Bundesvorstand — ein lokaler Vorstand kann sie nicht mehr bearbeiten.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Die übrigen lokalen Rollen — Vorstand, Event Organisator, Seiten Editor — vergibt die LEAD-Person',
         'Die übrigen lokalen Rollen (Vorstand, Event Organisator, Seiten Editor) vergibt die LEAD-Person'
       )::jsonb,
       updated_at = now()
 WHERE id = 'rollenvergabe'
   AND updated_by IS NULL
   AND body::text LIKE '%Die übrigen lokalen Rollen — Vorstand, Event Organisator, Seiten Editor — vergibt die LEAD-Person%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Hier siehst du Mitglieder ohne Gruppenzuordnung sowie jede föderationsweit offene Bewerbung — auch für Gruppen ohne aktiven Vorstand, wo sonst niemand entscheiden könnte.',
         'Hier siehst du Mitglieder ohne Gruppenzuordnung sowie jede föderationsweit offene Bewerbung, auch für Gruppen ohne aktiven Vorstand, wo sonst niemand entscheiden könnte.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'pool'
   AND updated_by IS NULL
   AND body::text LIKE '%Hier siehst du Mitglieder ohne Gruppenzuordnung sowie jede föderationsweit offene Bewerbung — auch für Gruppen ohne aktiven Vorstand, wo sonst niemand entscheiden könnte.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Gemeldete Beiträge landen in der Meldungs-Queue — nur für den Bundesvorstand sichtbar.',
         'Gemeldete Beiträge landen in der Meldungs-Queue, nur für den Bundesvorstand sichtbar.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'blog-moderation'
   AND updated_by IS NULL
   AND body::text LIKE '%Gemeldete Beiträge landen in der Meldungs-Queue — nur für den Bundesvorstand sichtbar.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Speichern — Mitglieder können sich anschließend an- und abmelden; volle Events führen eine Warteliste.',
         'Speichern, Mitglieder können sich anschließend an- und abmelden; volle Events führen eine Warteliste.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'lb-events'
   AND updated_by IS NULL
   AND body::text LIKE '%Speichern — Mitglieder können sich anschließend an- und abmelden; volle Events führen eine Warteliste.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Das Gruppenprofil — Name, Stadt, Standort auf der Karte — bearbeitest du als jeder Vorstand',
         'Das Gruppenprofil (Name, Stadt, Standort auf der Karte) bearbeitest du als jeder Vorstand'
       )::jsonb,
       updated_at = now()
 WHERE id = 'lb-profil-vs-seite'
   AND updated_by IS NULL
   AND body::text LIKE '%Das Gruppenprofil — Name, Stadt, Standort auf der Karte — bearbeitest du als jeder Vorstand%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Beides ist der LEAD-Rolle vorbehalten — die es wiederum an Seiten Editor bzw. Event Organisator delegieren kann.',
         'Beides ist der LEAD-Rolle vorbehalten, die es wiederum an Seiten Editor bzw. Event Organisator delegieren kann.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'lb-grenzen'
   AND updated_by IS NULL
   AND body::text LIKE '%Beides ist der LEAD-Rolle vorbehalten — die es wiederum an Seiten Editor bzw. Event Organisator delegieren kann.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Archivierte Gruppen kann auch ein LEAD nicht mehr verwalten — das übernimmt der Bundesvorstand.',
         'Archivierte Gruppen kann auch ein LEAD nicht mehr verwalten. Das übernimmt der Bundesvorstand.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'lead-grenzen'
   AND updated_by IS NULL
   AND body::text LIKE '%Archivierte Gruppen kann auch ein LEAD nicht mehr verwalten — das übernimmt der Bundesvorstand.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Events anlegen, bearbeiten und absagen — ohne den vollen Vorstandszugriff.',
         'Events anlegen, bearbeiten und absagen, ohne den vollen Vorstandszugriff.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'eo-scope'
   AND updated_by IS NULL
   AND body::text LIKE '%Events anlegen, bearbeiten und absagen — ohne den vollen Vorstandszugriff.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Du darfst ausschließlich die öffentliche Seite deiner Gruppe bearbeiten — Inhalte, Text und Darstellung.',
         'Du darfst ausschließlich die öffentliche Seite deiner Gruppe bearbeiten: Inhalte, Text und Darstellung.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'pe-scope'
   AND updated_by IS NULL
   AND body::text LIKE '%Du darfst ausschließlich die öffentliche Seite deiner Gruppe bearbeiten — Inhalte, Text und Darstellung.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'Ein separates Mitgliederverzeichnis gibt es nicht — die eigene Gruppe erreichst du über deren öffentliche Gruppenseite.',
         'Ein separates Mitgliederverzeichnis gibt es nicht. Die eigene Gruppe erreichst du über deren öffentliche Gruppenseite.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'interne-infos'
   AND updated_by IS NULL
   AND body::text LIKE '%Ein separates Mitgliederverzeichnis gibt es nicht — die eigene Gruppe erreichst du über deren öffentliche Gruppenseite.%';

UPDATE faq_entries
   SET body = replace(
         body::text,
         'als Alumnus gekennzeichnet — das ist eine Einordnung, keine Einschränkung.',
         'als Alumnus gekennzeichnet. Das ist eine Einordnung, keine Einschränkung.'
       )::jsonb,
       updated_at = now()
 WHERE id = 'alumni'
   AND updated_by IS NULL
   AND body::text LIKE '%als Alumnus gekennzeichnet — das ist eine Einordnung, keine Einschränkung.%';

UPDATE faq_entries
   SET question = 'Wie wechsle ich zwischen mehreren Rollen?',
       updated_at = now()
 WHERE id = 'scope-switcher'
   AND updated_by IS NULL
   AND question = 'Ich habe mehrere Rollen — wie wechsle ich zwischen ihnen?';

UPDATE faq_entries
   SET question = 'Wo bearbeite ich das Gruppenprofil und wo die Gruppenseite?',
       updated_at = now()
 WHERE id = 'lb-profil-vs-seite'
   AND updated_by IS NULL
   AND question = 'Wo bearbeite ich das Gruppenprofil — und wo die Gruppenseite?';

# ADR 0038 — Seitentitel gehören ins Dokument, nicht in die Route

- **Status:** Accepted
- **Date:** 2026-09-09
- **Supersedes:** —
- **Superseded by:** —

## Context

Jede Puck-Inhaltsseite (Über uns, BDAJ, Bundessprecher\*innenrat,
Verbandsstruktur, Impressum, Datenschutz, Nutzungsbedingungen) rendert bisher
einen fest verdrahteten `<h1>` in der Route, oberhalb des Puck-Dokuments. Der
Titel steht damit im Code und nicht in der Redaktion: Er lässt sich nicht
umbenennen, nicht in einen Hero legen, nicht hinter ein Bild setzen und nicht
weglassen.

Mit den Blöcken aus ADR 0036 (Hero, Karten-Raster, Kennzahlen, demnächst
CTA-Banner) ist der Aufmacher genau das, was die Redaktion selbst bauen soll.
Ein zusätzlicher Routen-`<h1>` steht dabei im Weg — er erzwingt eine
Schrift­größe und eine Position, die der Hero direkt darunter wiederholt.

## Decision

- **Die sieben Inhaltsseiten rendern keinen eigenen `<h1>` mehr.** Übrig bleibt
  der „Seite bearbeiten"-Link, und den sieht nur, wer die Seite bearbeiten darf
  (`SeiteBearbeitenLink`). Besucher\*innen bekommen ausschließlich das Dokument.
- **Gruppenseiten sind die Ausnahme.** Dort ist der Gruppenname eine
  Stammdaten-Eigenschaft der Gruppe, kein redaktioneller Text — Route und
  Breadcrumb, Stadt, Status und Kontaktkarte gehören zusammen. Der `<h1>` mit
  dem Gruppennamen bleibt.
- **Der `Überschrift`-Block bekommt die Ebene `h1` („Seitentitel")** in der
  Größe, die der Routen-`<h1>` hatte (`text-3xl`). Default für neue Blöcke
  bleibt `h2`.
- **Die Hero-Überschrift ist standardmäßig der `<h1>` der Seite** — genauer: die
  des _ersten_ Heros im Dokument. Jeder weitere Hero und jeder in einer Spalte
  verschachtelte bleibt `h2`. Wo die Route selbst einen Titel rendert
  (Gruppenseiten), stuft `normalizeContent` alle über die Option
  `eigenerSeitentitel` auf `h2`. Die Ebene ist kein Editorfeld: Sie folgt der
  Route, nicht der Redaktion, sonst entstehen Seiten mit zwei oder null `<h1>`.
- **Auf Gruppenseiten bietet der `Überschrift`-Block die Ebene `h1` gar nicht
  erst an** (`resolveFields` über den Slug, wie die `voll`-Breite in ADR 0036);
  ein Dokument, das sie schon trägt, wird beim Rendern auf `h2` gestuft.
- **Die drei Rechtstexte bekommen einen Leerzustand.** Impressum, Datenschutz
  und Nutzungsbedingungen sind nie flag-gegated und damit erreichbar, bevor
  jemand sie geschrieben hat; ohne Routen-Überschrift wäre die Seite sonst
  vollständig leer. Statt eines Titels rendert dort ein kurzer Hinweis.

## Consequences

- Bestehende Dokumente verlieren ihre sichtbare Überschrift, bis jemand sie im
  Editor ergänzt. Das betrifft alle sieben Seiten und ist der eigentliche Punkt
  der Änderung — es ist redaktionelle Nacharbeit, kein Datenverlust: Der Titel
  stand nie im Dokument, sondern im Code.
- Eine leere Seite ist danach wirklich leer. `<title>` (und damit Tab, Suche und
  Verlauf) kommt weiterhin aus dem Routen-Metadata-Block, nicht aus dem
  Dokument — die Seite ist also nie namenlos, nur sichtbar titellos.
- Die Zusicherung „genau ein `<h1>` pro Seite" ist für Heros technisch
  erzwungen (nur der erste wird befördert), für den `Überschrift`-Block nicht:
  Wer zwei `Überschrift (h1)`-Blöcke ablegt, bekommt zwei. Die E2E-Tests der
  Inhaltsseiten prüfen die Obergrenze, der Editor verhindert sie nicht.
- Der Editor-Canvas normalisiert mit derselben Regel (Gruppen-Slug ⇒ `h2`),
  damit die Vorschau die Ebene der öffentlichen Seite zeigt.

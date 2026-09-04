# FAQ-Suite v2 — Design-Spec

**Ticket:** #133 (Iteration 2 — löst die Vertagung aus der Spec vom 2026-08-02 ein)
**Datum:** 2026-09-04
**Status:** Freigegeben (Brainstorming-Session mit Bundesvorstand-Feedback)
**Ersetzt:** Layout/Content-Teile von `2026-08-02-faq-suite-design.md`; deren Rollen-Mapping und Sichtbarkeitsregeln gelten unverändert weiter.

---

## 1. Ziel

Die FAQ-Seite wird von einer schmalen statischen Spalte zu einer vollflächigen,
durchsuchbaren Hilfe-Oberfläche ausgebaut. Inhalte wandern aus dem Code in die
Datenbank und werden vom **Bundesvorstand** gepflegt. Mitglieder können Fragen
direkt aus dem FAQ einreichen; der Bundesvorstand beantwortet sie im
Board-Bereich und veröffentlicht sie als neue Einträge. Einträge können ein
YouTube-Tutorial einbetten.

Nicht-Ziele: Sichtbarkeitsregeln als editierbare Daten (bleiben im Code),
serverseitige Volltextsuche, Versionshistorie der Antworten, View-Counter,
SEO-Markup (Seite ist login-pflichtig), mehrere Videos pro Eintrag.

## 2. Architektur: neues Modul `modules/faq`

Approach A aus dem Brainstorming: Die FAQ wird strukturierte Daten mit einem
eigenen Modul nach den Acht Regeln — eigene Tabellen, eigene Migrationen
(`modules/faq/migrations/`, im Manifest registriert), typisierte Services über
`index.ts`, Integrationstests gegen Docker-Postgres. Kein Puck: Struktur und
Layout bleiben im Code, damit Suche, Sichtbarkeit und das vollflächige Layout
garantierbar sind statt davon abzuhängen, was Redakteur\*innen komponieren.

Verworfen: Erweiterung von `modules/content` (vermischt Ownership von
generischen Puck-Seiten mit strukturierten FAQ-Daten); statischer Content mit
DB-Overrides (zwei Wahrheitsquellen, Einreichungen passen nicht ins Modell).

## 3. Datenmodell

| Tabelle           | Spalten (Kern)                                                                                                      | Zweck                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `faq_topics`      | `id, name, position`                                                                                                | Themen-Labels (Events, Dateien, Administration, …), vom Board verwaltbar; keine Sichtbarkeitssemantik |
| `faq_entries`     | `id, section, subgroup, topic_id, question, body, youtube_id, status, position, created_at, updated_at, updated_by` | Ein FAQ-Eintrag                                                                                       |
| `faq_entry_links` | `(entry_id, related_entry_id)`                                                                                      | „Verwandte Fragen"-Chips, FK-Integrität beim Löschen                                                  |
| `faq_feedback`    | `(entry_id, user_id) PK, helpful, updated_at`                                                                       | Eine Stimme pro Mitglied pro Eintrag, änderbar; nur Aggregate verlassen das Modul                     |
| `faq_submissions` | `id, question, details, submitted_by, status, entry_id, created_at, decided_by, decided_at`                         | Eingereichte Fragen                                                                                   |

- `section`: Enum `allgemein | bundesvorstand | vorstand | mitglieder`.
  `subgroup`: nullable Rollen-Enum (nur Vorstand-Unterrollen). **Sichtbarkeit
  wird nicht gespeichert** — die Schlüssel mappen auf die bestehende
  `visibleTo`-Logik im Code; Redakteur\*innen können Sichtbarkeit nicht
  fehlkonfigurieren.
- `body`: Tiptap-JSON (eingeschränktes Set: fett/kursiv, Links, Listen,
  Zwischenüberschriften — wie Event-Seiten).
- `status`: `draft | published`. Speichern erzeugt/ändert Entwürfe; explizites
  „Veröffentlichen" schaltet live.
- `topic_id`: nullable — Themen sind eine **orthogonale zweite Dimension**
  (Bereiche = wer sieht es, Themen = worum geht es).
- `faq_submissions.status`: `open | answered | discarded`. „Antwort verfassen"
  erzeugt einen **Entwurfs-Eintrag** (verknüpft via `entry_id`); dessen
  Veröffentlichung setzt die Submission auf `answered`.

## 4. Modul-Services & Autorisierung

`modules/faq/index.ts` exportiert: Entry-/Topic-CRUD, `listEntries`,
`upsertFeedback`, `createSubmission`, `listSubmissions`,
`openSubmissionCount`. **Services sind auth-agnostisch; die App-Schicht
autorisiert** (Events-Lektion): Jede Schreib-Action prüft `isFederalBoard`,
außer `createSubmission` (jedes angemeldete Mitglied) und `upsertFeedback`
(jedes angemeldete Mitglied, nur eigene Stimme). Die Sichtbarkeitsfilterung
bleibt in `apps/web/lib/faq` und läuft über DB-Zeilen statt statischer Objekte.

## 5. Leseseite `/faq`

Vollflächiges Docs-Layout (ersetzt `max-w-3xl`):

- **Grid:** Sticky-Rail links (~260px, ab `lg:`) + breite Hauptspalte. Mobil
  wird die Rail zur horizontal scrollbaren Chip-Zeile unter der Suche.
- **Rail:** sichtbare Bereiche als Anker-Links (primärer Bereich zuerst,
  markiert — bestehende `orderSections`-Logik), darunter Themen-Filterchips.
  Scroll-Spy via `IntersectionObserver`.
- **Hauptspalte:** Accordion-Idiom des Design-Systems (`<details>`, 12px-Karten,
  `+`→`×`, `[open]`-Linksborder). Pro Eintrag: Themen-Chip, „Video"-Tag; offen:
  Antwort, „Zuletzt aktualisiert", verwandte Fragen, Copy-Link, Daumen.
- **Deep-Links:** stabile Eintrags-IDs; `/faq#<id>` öffnet und scrollt.
- **Suche:** clientseitig über die bereits gelieferten (sichtbarkeitsgefilterten)
  Einträge; filtert, öffnet Treffer-Accordions, hebt Treffer mit `<mark>`
  hervor. `/` fokussiert das Feld. Kein Treffer → „Keine Antwort gefunden —
  Frage einreichen" mit vorbefüllter Frage.
- **Video:** Click-to-load-Fassade — lokal gerendertes Thumbnail + Play-Button;
  das `youtube-nocookie.com`-iframe mountet erst nach Klick (kein
  Google-Request vorher). 16:9, lazy, mit Titel. Ein Eintrag im
  `docs/datenschutz`-Verzeichnis dokumentiert das.
- **Einreichen:** persistenter „Frage einreichen"-Button oben (+ No-Results-CTA),
  öffnet den Dialog (Frage + optionale Details, Bestätigungszustand).

## 6. Board-Oberfläche `/federal/faq`

Neuer `FEDERAL_NAV`-Eintrag „FAQ", Zugriff wie der übrige Federal-Bereich
(Nicht-Board → 404). Zwei Tabs:

- **Fragen & Antworten:** Einträge gruppiert nach Bereich/Untergruppe, Entwürfe
  gebadged, Hoch/Runter-Sortierung (schreibt `position`), pro Eintrag
  Feedback-Zähler (👍/👎). Themen inline verwaltbar.
- **Offene Fragen:** Submission-Karten (Frage, Details, wer, wann) mit „Antwort
  verfassen" (öffnet das Eintragsformular vorbefüllt und verknüpft) und
  „Verwerfen" (mit Bestätigung).
- **Federal-Übersicht:** Zählerkarte
  `{ count: openSubmissionCount, label: "Offene FAQ-Fragen", href: "/federal/faq" }`
  — nur bei > 0, analog „Freigaben".

**Alles Bearbeiten läuft im Modal:** Antworten, Eintrag bearbeiten, Thema
anlegen, Verwerfen-Bestätigung öffnen ein Dialog-Fenster über abgedunkeltem
Backdrop; die Seite dahinter bleibt stehen. Formular: Frage, Bereich +
Untergruppe, Thema, Tiptap-Body, YouTube-URL (ID wird geparst,
Thumbnail-Vorschau), Verwandte-Einträge-Picker, „Speichern" (Entwurf) /
„Veröffentlichen".

### Neue Design-System-Primitive: `Dialog`

`core/design-system` bekommt eine `Dialog`-Komponente (bisher nur App-lokale
Dialoge wie `CropDialog`): abgedunkelter Backdrop, Karte mit 12px-Radius und
Layered-Shadow, Fade/Scale über Token-Dauern, Fokus-Falle, Esc +
Klick-außerhalb schließen (Nachfrage bei ungespeicherten Änderungen),
`prefers-reduced-motion` respektiert. Der Einreichen-Dialog der Leseseite nutzt
dieselbe Primitive.

## 7. Migration & Seed

- Einmaliges Konvertierungsskript: `apps/web/content/faq/*.ts` (30 Einträge) →
  Tiptap-JSON → **Seed-Migration** in `modules/faq/migrations/`. Eintrags-IDs
  bleiben erhalten (stabile Deep-Links). Alle als `published`,
  `updated_by = null`.
- Start-Themen in derselben Seed-Migration, Einträge grob zugeordnet;
  Feinkorrektur macht der Bundesvorstand im Editor.
- Statische Content-Dateien bleiben als Fallback liegen; Entfernung in einem
  Aufräum-PR nach stabilem Betrieb.

## 8. Feature-Flag & Rollout

Neues Flag **`faq_suite`**. Aus → `/faq` rendert die heutige statische Seite
(nichts Halbfertiges sichtbar, obwohl `faq` in Prod an ist). An → neue Seite,
Board-Bereich, Einreichungen.

PR-Schnitt (Files-Muster, ein PR pro Schritt):

1. Modul `modules/faq` — Schema, Migrationen, Services, Integrationstests, Seed.
2. Lese-Erlebnis — neues `/faq`-Layout aus der DB (Rail, Suche, Videos,
   Deep-Links) + `Dialog`-Primitive.
3. Board-Oberfläche `/federal/faq` — Verwaltung, Entwurf/Veröffentlichen, Themen.
4. Einreichungen + Feedback — Dialog, Offene-Fragen-Tab, Übersichtskarte, Daumen.

`/review` auf jeden PR; PR 3 und 4 berühren Berechtigungen → `/security-review`.

## 9. Tests

- **Modul (Docker-Postgres):** CRUD, Statusübergänge Submission → Entwurf →
  veröffentlicht, Feedback-Upsert, Link-Integrität beim Löschen, Sortierung.
- **App-Unit:** Sichtbarkeit/Sortierung (bestehende `lib/faq`-Tests auf
  DB-Zeilen umgestellt), Suche/Highlight, YouTube-ID-Parsing.
- **E2E (`e2e/faq.e2e.ts` erweitert):** Gast → Login-Redirect; Mitglied sieht
  neues Layout, sucht, öffnet Treffer; Mitglied reicht Frage ein →
  Bundesvorstand sieht Zähler, verfasst Antwort im Modal, veröffentlicht →
  Eintrag erscheint; Nicht-Board-Mitglied bekommt auf `/federal/faq` 404.

# ADR 0034 — Freies Layout & zweite Puck-Paletten-Erweiterung

- **Status:** Accepted
- **Date:** 2026-09-08
- **Supersedes:** —
- **Superseded by:** —

## Context

ADR 0025 erweiterte die deliberately kleine Drei-Block-Palette aus ADR 0023 auf
elf Blöcke, blieb aber bei einem einzigen Layout-Primitiv (`Spalten`, feste
2er/3er-Gleichspalten) und einer schmalen Root-Breite. Redaktion (Bundesvorstand)
empfand das erneut als zu eng: keine volle Seitenbreite, kein Hero-Bereich,
keine Kennzahlen-Darstellung, kein durchklickbares Element für Werte/Personen,
kein generischer Container.

Als Referenz wurde `peoplekit/puck-mui` vorgeschlagen (fertige Puck-Blöcke auf
MUI-Basis). Prüfung ergab: reiner MUI-Primitive-Wrapper (11 Komponenten,
`PHeading`/`PButton`/`PColumns`/`PCard`/`PAccordion` u. ä.), kein
Hero-/Feature-/Stats-/Testimonial-Block, inhaltlich dünner als die bestehende
BDAS-Palette. MUI + Emotion als zweites Styling-System hätte zudem das
gepinnte Tailwind/shadcn-Stack (CLAUDE.md §2) und das geschlossene
Design-Token-System (§7) unterlaufen.

## Decision

- **Root-Breite** bekommt eine dritte Option `voll` (kein `max-w-*`), nur für
  Inhaltsseiten (Über uns, BDAJ, Bundessprecherinnenrat, Verbandsstruktur,
  Gruppen-Seiten) über eine Slug-Allowlist wählbar. Rechtstexte behalten
  `schmal`/`breit`.
- **`Spalten`** bekommt asymmetrische Presets (1/3+2/3, 2/3+1/3, 4-gleich)
  zusätzlich zu den bestehenden Gleichspalten — weiterhin feste, literale
  Tailwind-Klassen, kein neues Grid-Token-System.
- **Sieben neue Blöcke**: Panel/Kasten, Akkordeon, Hero/Header-Section,
  Feature-/Karten-Grid, Stats/Zahlen-Reihe, CTA-Banner, Karussell. Alle
  rendern ausschließlich über `core/design-system`-Tokens; kein raw HTML,
  keine Freitext-CSS-Props — ADR 0023's No-raw-HTML-Garantie gilt unverändert
  für jeden neuen Block.
- **`puck-mui` wird nicht installiert.** Shadcn-basierte Block-Bibliotheken
  (shadcnblocks.com, Tailark u. a. — derselbe Tailwind/Radix-Stack wie BDAS)
  dienen ausschließlich als visuelle/strukturelle Referenz; jede Umsetzung ist
  eigener, tokenisierter Code.
- **Eine neue Laufzeit-Abhängigkeit:** `embla-carousel-react` über shadcn/ui's
  offizielle `Carousel`-Primitive, für den Karussell-Block. Pfeil-Navigation
  ist fertig; Punkte-Navigation wird über Emblas API selbst gebaut;
  Tastatur-Verhalten wird zu Beginn des betreffenden PRs verifiziert statt
  hier vorausgesetzt. Erster Block mit echter Client-Interaktivität (alle
  bisherigen sind statisch oder nutzen wie das Akkordeon reines `<details>`
  ohne JavaScript). Isoliert in einem eigenen PR.
- **Karussell ohne Autoplay** — nur Klick-/Tastatur-Navigation. Vermeidet
  Barrierefreiheits-Probleme automatisch rotierender Inhalte.
- **Ein neues Design-System-Rezept** („Karussell") wird `core/design-system`
  hinzugefügt, komponiert ausschließlich aus bestehenden Tokens (Pill-Radius,
  Akzentfarbe, bestehende Motion-Dauern) — keine neuen Rohwerte.
- Kein `content`-Modul-, Schema- oder Migrationswechsel (Root- und
  Block-Props sind bereits passthrough-JSON, siehe ADR 0025). Kein neues
  Feature-Flag — bestehendes `content`/`public_shell`-Gating gilt weiter.
- Umsetzung in fünf PRs (Fundament, Hero, Grid & Stats, CTA, Karussell) —
  Details in `docs/superpowers/specs/2026-09-08-content-pages-layout-erweiterung-design.md`.

## Consequences

- Die Palette wächst von elf auf achtzehn Blöcke; jeder ist weiterhin klein,
  token-gestylt und unabhängig getestet (Linie von ADR 0025 fortgesetzt).
- Erstmals eine Client-seitige Laufzeit-Abhängigkeit (`embla-carousel-react`)
  im Content-Rendering-Pfad — Bundle-Impact und A11y-Verhalten sind fester
  Review-Punkt für den betreffenden PR, nicht nur allgemeine Codequalität.
- Root-Breite und Spalten-Presets bleiben ein geschlossenes, kuratiertes Set
  (keine frei skalierbaren Werte) — Konsistenz mit dem Design-Token-System
  bleibt technisch erzwungen, nicht nur redaktionell empfohlen.
- `puck-mui` und vergleichbare Fremd-Bibliotheken bleiben dauerhaft
  Referenzmaterial, nie Abhängigkeit — verhindert eine zweite visuelle
  Sprache im Produkt.

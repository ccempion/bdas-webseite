# Content-Seiten: Freies Layout & erweiterter Block-Katalog — Design-Spec

**Datum:** 2026-09-08
**Status:** Freigegeben (Brainstorming-Session)
**Bezug:** ADR 0023 (Puck-Grundentscheidung), ADR 0025 (erste Paletten-Erweiterung), ADR 0034 (diese Erweiterung)
**Scope:** `apps/web/app/_content/puck-config.tsx` + zugehörige Feld-/Renderer-Dateien, `core/design-system` (ein neues Rezept), `apps/web/package.json` (eine neue Abhängigkeit). Kein `modules/content`-Schema, keine Migration, kein neues Feature-Flag.

---

## 1. Ziel

Redakteur\*innen empfinden die heutigen Content-Seiten (Über uns, BDAJ, Bundessprecherinnenrat, Verbandsstruktur, Gruppen-Seiten) als zu eingeschränkt: schmale Spalte, nur 2-oder-3-gleiche Spalten als einziges Layout-Primitiv, kein Block für Hero-Bereiche, Kennzahlen, Karussells oder generische Container. Diese Spec erweitert Layout-Freiheit und Block-Katalog, ohne die harten Invarianten aus ADR 0023/0025 zu verletzen (kein raw HTML, kein freies CSS pro Block, geschlossenes Design-Token-System).

**Nicht-Ziele:**

- Kein MUI/Emotion, keine Fremd-Design-Sprache. `puck-mui` (von der Produktseite als Referenz genannt) wurde geprüft: es ist ein reiner MUI-Primitive-Wrapper ohne Hero-/Feature-/Stats-/Testimonial-Blöcke und liefert daher inhaltlich nichts, das übernommen werden könnte — nur als Negativ-Beispiel relevant (siehe §2).
- Keine frei skalierbaren Spaltenbreiten (kein neues Grid-/Spacing-Token-System).
- Kein raw-HTML- oder Freitext-CSS-Block — harte Sicherheitsgrenze (XSS), unverändert seit ADR 0023.
- Kein Entwurf/Veröffentlichen-Workflow — `save = live` bleibt (ADR 0023).
- Keine Layout-Erweiterung auf Rechtstexte (Datenschutz, Impressum, Nutzungsbedingungen) — bleiben schmal, reiner Fließtext.

## 2. Kontext: warum nicht einfach eine fertige Bibliothek?

Zwei Kandidaten wurden geprüft:

- **`peoplekit/puck-mui`** (vom Produktseite vorgeschlagen): 11 Komponenten, alles rohe MUI-Wrapper (`PHeading`, `PButton`, `PColumns`, `PCard`, `PAccordion`, …). Verworfen: erfordert MUI + Emotion als zweites, paralleles Styling-System neben dem gepinnten Tailwind/shadcn-Stack (CLAUDE.md §2) und würde das geschlossene Token-System (§7) unterlaufen. Zudem inhaltlich dünn — kein Hero, kein Testimonial, keine Stats, keine Galerie; ein direkter Vergleich mit unseren 11 Blöcken zeigt, dass BDAS bei den meisten bereits vorn liegt (Fliesstext, Bild, Zitat, Organigramm haben dort keine Entsprechung).
- **shadcn-Block-Ökosystem** (shadcnblocks.com, Shadcn Studio, Tailark u. a.): fertige Marketing-Sections (Hero, Feature-Grid, Testimonials, Stats, CTA), gebaut mit demselben Stack (Tailwind + Radix/shadcn) wie BDAS. Werden **nur als visuelle/strukturelle Referenz** genutzt — Layout und Aufbau als Vorlage, aber komplett neu gebaut mit `core/design-system`-Tokens statt übernommenem Fremd-Styling. Kein Lizenzrisiko durch wörtliche Übernahme, keine zweite visuelle Sprache.

Echte Lücken, die der Vergleich mit puck-mui aufgedeckt hat (unabhängig von MUI):

1. `Spalten` kennt nur gleich breite 2er/3er-Splits, keine asymmetrischen Presets.
2. Kein generischer Container-Block — einzige Verschachtelung ist `Spalten`.
3. Kein Akkordeon-Block, obwohl `<details>` in CLAUDE.md §7 bereits als „kanonisches Disclosure-Pattern" dokumentiert ist.

## 3. Geltungsbereich

Volle Breite und alle neuen Blöcke gelten für Inhaltsseiten (Über uns, BDAJ, Bundessprecherinnenrat, Verbandsstruktur, Gruppen-Seiten). Rechtstexte bleiben unverändert bei `schmal`/`breit`.

## 4. Root-Breite: dritte Option „voll"

`root.render` bekommt eine dritte `breite`-Option neben `schmal` (`max-w-3xl`) und `breit` (`max-w-5xl`): **`voll`** — kein `max-w-*`, volle verfügbare Breite innerhalb des Seiten-Paddings.

- **Slug-Allowlist, keine reine Redaktionsempfehlung:** Die `breite`-Feldoptionen werden je nach Slug gefiltert (Rechtstexte sehen `voll` gar nicht als Option), analog zum bestehenden Mechanismus, der Editor-Routen hinter `public_shell` + `content` gate.
- Keine Schema-Änderung — `root.props` ist bereits `z.record(z.unknown()).optional()` passthrough (`modules/content/src/types.ts`).
- Default bleibt `schmal`; bestehende Seiten rendern unverändert, bis jemand die Option ändert.

## 5. `Spalten`: erweiterte Presets

Zusätzlich zu den bestehenden gleich breiten 2er/3er-Splits: **1/3 + 2/3**, **2/3 + 1/3**, **4 gleich**. Weiterhin feste, literale Tailwind-Grid-Klassen (kein Interpolieren — Tailwinds Scanner sieht nur Literale, wie bereits bei `ausrichtungText`/`ausrichtungElement` etabliert). Kein neues Grid-Token-System; jede Preset-Klasse ist eine feste, dokumentierte Kombination.

## 6. Neue Blöcke

| Block | Zweck / typische Verwendung | Editierbare Felder (Kern) | Baut auf | Client-JS? |
| --- | --- | --- | --- | --- |
| **Panel/Kasten** | Visuelles Gruppieren beliebiger Blöcke (z. B. Kontakt-Box, hervorgehobener Abschnitt) | Titel (optional), Variante (Standard/Hervorgehoben), verschachtelte DropZone | bestehendes `Card`-Rezept aus `core/design-system` | Nein |
| **Akkordeon** | FAQ-artige Abschnitte auf Nicht-FAQ-Seiten (z. B. „Häufige Fragen zu unserer Gruppe") | Array `{ Frage, Antwort }`, beliebig viele Einträge | `<details>`-Idiom (§7): linker Rand + Halo bei `[open]`, `+`→`×`-Rotation | Nein (natives `<details>`) |
| **Hero/Header-Section** | Aufmacher-Bereich am Seitenanfang (Über uns, BDAJ) | Überschrift, Untertext, Hintergrund (Bild oder Token-Fläche), optionaler Button, Ausrichtung | bestehender `Button`-Block, `Bild`-Feld, `cardLiftLg`-Schatten-Token | Nein |
| **Feature-/Karten-Grid** | Gleichförmige Karten nebeneinander (z. B. „Unsere Angebote") | Array `{ Icon/Bild, Titel, Text }`, Spaltenzahl 2/3/4 | `Card`-Rezept + `PersonenRaster`-Grid-Pattern | Nein |
| **Stats/Zahlen-Reihe** | Hervorgehobene Kennzahlen (z. B. „500+ Mitglieder") | Array `{ Wert (Text, erlaubt „500+"), Beschriftung }` | Gleich-Spalten-Pattern, `typography.size`-Tokens | Nein |
| **CTA-Banner** | Hervorgehobener Aufruf mit Button (z. B. „Jetzt Mitglied werden") | Überschrift, Text, Button, Hintergrund (Akzent oder neutrale Token-Fläche) | bestehender `Button`-Block; Akzentfarbe hier als legitime aktive/CTA-Verwendung (§7-konform, kein Fließtext) | Nein |
| **Karussell** | Durchklickbare Elemente (z. B. „Werte", Personen/Persönlichkeiten) | Array `{ Bild/Icon (optional), Titel, Text }`, Navigation Pfeile + Punkte | **neu:** shadcn `Carousel`-Primitive (embla-carousel-react) — Pfeile (`CarouselPrevious`/`CarouselNext`) sind fertige Sub-Komponenten, Punkte-Navigation ist **kein** fertiges Element und wird über Emblas API (aktueller Index, `scrollTo`) selbst gebaut | **Ja** — erster client-interaktiver Block |

Alle sieben folgen dem etablierten Muster: typisierte Puck-Felder, Rendering ausschließlich über `core/design-system`-Tokens, kein `dangerouslySetInnerHTML`, keine Freitext-Styling-Props.

**Karussell — explizit kein Autoplay.** Nur Klick-/Tastatur-Navigation (Pfeile + Punkte). Kein automatisch rotierender Inhalt — einfacher zugänglich (keine Screenreader-Störung durch selbstständig wechselnde Inhalte) und entspricht der ursprünglichen Anforderung („per Klick durchgehen").

## 7. Neue Design-System-Ergänzung: Karussell-Rezept

`core/design-system` kennt aktuell kein Karussell-Muster (nur Card/Dropdown/Accordion, siehe README „Component recipes"). Neuer Eintrag, komponiert ausschließlich aus bestehenden Werten — keine neuen Rohwerte:

- Navigationspunkte: Pill-Radius (20px, bereits reserviert für „Cards, dropdown panels, accordions, mobile pills"), aktiver Punkt in Akzentfarbe.
- Folienwechsel: bestehende Motion-Dauer für „Expand/fade-in transitions".
- Pfeil-Buttons: gleiche Hover-Lift-Konvention wie Cards (`cardLiftSm`).

Wird als Vorschlag in `core/design-system/README.md` + `tokens.ts` (`recipes`-Export) ergänzt, bevor der Karussell-Block ihn konsumiert (§7-Prozess: „propose an addition rather than ad-hoc'ing it").

## 8. Neue Abhängigkeit

`embla-carousel-react` (über shadcn/ui's offizielle `Carousel`-Komponente, `pnpm dlx shadcn@latest add carousel`) — kleine, aktiv gepflegte Bibliothek, Teil des bereits gepinnten shadcn/ui-Baukastens (noch nicht installiert). Bringt Swipe-Geste und die Pfeil-Sub-Komponenten fertig mit; ob Tastatur-Navigation ohne Zusatzarbeit funktioniert, ist in der offiziellen Doku nicht explizit bestätigt — **zu verifizieren zu Beginn von PR 5**, nicht hier vorausgesetzt. Einzige neue Laufzeit-Abhängigkeit dieser Spec; isoliert in PR 5 (siehe §10), damit sie unabhängig review-fähig ist.

## 9. In-Editor-Preview-Umschalter

Ein Umschalter im Editor, der die Editier-Rahmen/-Handles ausblendet und exakt die öffentliche Darstellung zeigt (Puck ^0.23.0 bringt dafür Basisfunktionalität mit, siehe Editor-Canvas-Iframe in `PuckEditor.tsx`). `save = live` bleibt unverändert — der Umschalter ändert nur die Editor-Ansicht, keinen Speicher-/Publish-Fluss. Genauer API-Mechanismus wird in der Umsetzungsplanung von PR 1 verifiziert (nicht hier festgeschrieben, um keine falsche Präzision vorzutäuschen).

## 10. PR-Sequenzierung

Ein Spec, mehrere PRs — analog zum Vorgehen bei FAQ-Suite v2 und Event-Pages in diesem Repo:

1. **Fundament:** Root-Breite (§4) + Spalten-Presets (§5) + Panel (§6) + Akkordeon (§6) + Preview-Umschalter (§9). Kleinste, am stärksten auf Bestehendem aufbauende Änderungen, keine neue Abhängigkeit.
2. **Hero:** Hero/Header-Section (§6). Größte neue visuelle Fläche unter den Nicht-Karussell-Blöcken.
3. **Grid & Stats:** Feature-/Karten-Grid + Stats-Reihe (§6). Teilen sich das Array-Grid-Pattern.
4. **CTA-Banner:** (§6). Kleinste neue Fläche, reine Kombination bestehender Bausteine.
5. **Karussell:** (§6, §7, §8). Isoliert, da einzige neue Abhängigkeit und einziger client-interaktiver Block — eigener Review-Fokus (Bundle-Size, Tastatur-/Screenreader-Verhalten).

`/review` auf jeden PR. Kein `/security-review` nötig, da kein Auth-/Payments-/Files-Bezug — aber PR 5 verdient wegen der neuen Abhängigkeit besondere Aufmerksamkeit auf Bundle-Impact und A11y (Barrierefreiheit) im normalen Review.

## 11. Tests

- **Unit (`puck-config.test.ts`, node env, `renderToStaticMarkup`):** pro neuem Block — Default-Props rendern erwartete Klassen/DOM; Regression: gespeicherte Dokumente ohne die neuen Props (ältere Seiten) rendern unverändert.
- **Karussell:** Klick-Navigation (Pfeile, Punkte) wechselt die Folie; Tastatur-Verhalten wird entsprechend dem in PR 5 verifizierten Stand getestet (§8); kein Autoplay-Timer im DOM/Snapshot nachweisbar.
- **Slug-Allowlist für `voll`:** Unit-Test, dass Rechtstexte-Slugs die Option nicht im Feld sehen.
- Kein neuer E2E-Flow nötig — bestehende Editor-/Content-Page-E2E-Abdeckung (falls vorhanden) deckt „Block einfügen, speichern, öffentliche Seite zeigt es" bereits strukturell ab; falls diese Spec neue Slugs oder Routen einführt, wird das in der jeweiligen PR-Planung geprüft.

## 12. Offene Punkte für die Umsetzungsplanung

- Exakter Preview-Mechanismus in Puck ^0.23.0 (§9) — API-Recherche zu Beginn von PR 1.
- Exaktes visuelles Feintuning jedes neuen Blocks (Höhen-Presets für Hero, genaue Grid-Breakpoints für Feature-Grid) — Ausgestaltung in der jeweiligen PR-Planung, nicht hier vorweggenommen.
- Karussell-Rezept-Vorschlag (§7) muss vor PR 5 in `core/design-system` abgestimmt und gemerged sein.

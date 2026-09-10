# Karussell: Coverflow-Darstellung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der bestehende Puck-Baustein `Karussell` bekommt zwei Auswahlfelder — eine 3D-Coverflow-Darstellung neben der heutigen klassischen, und eine Wahl, wo Titel und Text erscheinen.

**Architecture:** Kein zweiter Baustein. Die gesamte Geometrie (welche Folie ist mittig, wie stark ist eine Folie weggedreht) wandert in ein neues, reines Modul ohne DOM-Zugriff — dasselbe Muster, mit dem `aktiveFolie` schon heute ohne Layout-Engine testbar ist. Die Komponente hält nur noch eine Zustandsgröße, die Scroll-Position der Schiene, und leitet alles Übrige daraus ab.

**Tech Stack:** TypeScript, React 18, Next.js 14 App Router, Tailwind CSS 3.4, Puck 0.23, Vitest + happy-dom, Playwright (nur zur Sichtprüfung in Task 5).

**Spec:** Kein eigenes Spec-Dokument — die Entscheidung wurde im Gespräch getroffen (bounded path der brainstorming-Skill) und wird in Task 1 als **ADR 0041** festgehalten. Die verbindlichen Festlegungen stehen vollständig unter „Global Constraints"; der Plan ist damit allein lesbar.

---

## Global Constraints

- **Nur betroffene Tests ausführen.** Ausdrückliche Anweisung des Nutzers: niemals `pnpm test` über die ganze Suite. Immer nur die in der jeweiligen Task genannten Dateien, z. B. `pnpm exec vitest run apps/web/app/_content/Karussell.test.tsx`.
- **Vitest erfasst zusätzlich Kopien unter `.claude/worktrees/`.** Ein Lauf über `apps/web/app/_content/…` meldet deshalb zwei Testdateien. Das ist bekannt und kein Fehler — nur die Datei ohne `worktrees/` im Pfad zählt.
- **Vorgabewert ist `klassisch`.** Bestehende Dokumente (u. a. die Live-Seite `/ueber-uns`) dürfen sich optisch nicht verändern. Kein Feature-Flag: die Vorgabe ist die Absicherung.
- **Keine neue Laufzeit-Abhängigkeit.** ADR 0040 hat die gesamte Karussell-Serie ohne eine solche abgeschlossen; das gilt weiter. Kein embla, kein swiper, kein framer-motion.
- **Kein Autoplay, keine Endlosschleife.** ADR 0040 schließt beides aus.
- **Werte des Designsystems kommen aus `tokens.ts`** (CLAUDE.md §7). Drehwinkel, Skalierung, Deckkraft, Perspektive und Folienbreite werden in Task 1 als benannte Tokens angelegt und danach nur noch importiert — nie als Zahl in der Komponente.
- **Deutsche Bezeichner im App-Code, englische im Designsystem.** `apps/web/app/_content/` benennt fachlich deutsch (`folien`, `aktiveFolie`); `core/design-system/` bleibt englisch (`colors`, `motion`). Diese Grenze nicht verwischen.
- **Neue `.tsx`-Dateien unter `apps/web/app/` brauchen `import React from "react"`,** sonst schlagen sie in Vitest mit „React is not defined" fehl.
- **ADR-Nummer vor dem Anlegen prüfen:** `git ls-tree --name-only origin/main docs/decisions/ | sort | tail -3`. Stand bei Planerstellung: höchste vergebene Nummer ist 0040, nächste frei ist **0041**. Wenn inzwischen 0041 belegt ist, die nächste freie nehmen und alle Verweise im Plan mitziehen.
- **Branch:** `feat/karussell-coverflow`, abgezweigt von `origin/main` (Stand `d032a8f`). Nicht von einem worktree-Branch abzweigen.
- **Commit-Fußzeile:** jeder Commit endet mit `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Dateien im Überblick

| Datei | Verantwortung |
|---|---|
| `core/design-system/src/tokens.ts` | **Ändern.** Neue Token-Gruppe `coverflow` + Rezept-Eintrag. |
| `core/design-system/src/index.ts` | **Ändern.** `coverflow` exportieren. |
| `core/design-system/README.md` | **Ändern.** Coverflow im Karussell-Abschnitt beschreiben. |
| `docs/decisions/0041-karussell-coverflow-darstellung.md` | **Neu.** Warum eine Variante statt eines zweiten Bausteins, warum der Editor flach bleibt. |
| `apps/web/app/_content/karussell-darstellung.ts` | **Neu.** Reine Geometrie: aktive Folie, relative Lage, 3D-Stil, Darstellungswahl. Kein DOM, kein React-State. |
| `apps/web/app/_content/karussell-darstellung.test.ts` | **Neu.** Unit-Tests dazu. |
| `apps/web/app/_content/Karussell.tsx` | **Ändern.** Verdrahtung: Scroll-Position, Overlay-Schaltflächen, Bildunterschriften. |
| `apps/web/app/_content/Karussell.test.tsx` | **Ändern.** Import von `aktiveFolie` umziehen; Tests für die neuen Darstellungen. |
| `apps/web/app/_content/puck-config.tsx` | **Ändern.** Zwei Felder, `resolveFields`, Editor erzwingt klassisch. |
| `apps/web/app/_content/puck-config.test.ts` | **Ändern.** Feld- und Editor-Verhalten. |

---

### Task 1: Tokens, Rezept und ADR

Das Fundament: alle Zahlen, die der Effekt braucht, bekommen einen Namen. Ohne diese Task müsste Task 2 Werte erfinden, was CLAUDE.md §7 verbietet.

**Files:**
- Modify: `core/design-system/src/tokens.ts`
- Modify: `core/design-system/src/index.ts:8-21`
- Modify: `core/design-system/README.md:69-76`
- Create: `docs/decisions/0041-karussell-coverflow-darstellung.md`

**Interfaces:**
- Consumes: nichts.
- Produces: `import { coverflow } from "@bdas/design-system"` mit den Feldern `perspective: number`, `tiltDeg: number`, `scale: number`, `opacity: number`, `maxSlots: number`, `slideWidthPct: number`. Alles Zahlen ohne Einheit — die Einheit hängt Task 2 an, damit sich mit den Werten rechnen lässt.

- [ ] **Step 1: ADR-Nummer verifizieren**

```bash
git ls-tree --name-only origin/main docs/decisions/ | sort | tail -3
```

Erwartet: `0040-karussell-ohne-neue-abhaengigkeit.md` als höchste. Ist 0041 bereits vergeben, die nächste freie Nummer nehmen und im weiteren Verlauf konsequent verwenden.

- [ ] **Step 2: Token-Gruppe anlegen**

In `core/design-system/src/tokens.ts`, direkt nach dem `motion`-Block (er endet mit `} as const;` um Zeile 121) einfügen:

```ts
/**
 * The carousel's Coverflow presentation. Plain numbers rather than CSS
 * strings: the slide tilt is interpolated from a fractional distance, so the
 * consumer has to do arithmetic with these and then attach the unit.
 */
export const coverflow = {
  /** Depth of the 3-D scene, in px, set on the rail. */
  perspective: 1200,
  /** Tilt in degrees of a slide one full slot off centre. */
  tiltDeg: 38,
  /** Scale of a slide one full slot off centre. */
  scale: 0.82,
  /** Opacity of a slide one full slot off centre. */
  opacity: 0.55,
  /** Slots from centre beyond which nothing gets more extreme — the deck
   *  reads as three cards however many slides the board added. */
  maxSlots: 2,
  /** Width of one slide as a percentage of the rail, leaving the rest to the
   *  two neighbours peeking in. Also fixes the rail's side padding, so the
   *  first and last slide can still reach the centre. */
  slideWidthPct: 70,
} as const;

export type Coverflow = typeof coverflow;
```

- [ ] **Step 3: Rezept ergänzen**

In derselben Datei im `recipes`-Objekt, direkt nach dem `carousel`-Eintrag (um Zeile 193):

```ts
  coverflowCarousel:
    "carousel in its Coverflow presentation: rail gets coverflow.perspective, each slide is coverflow.slideWidthPct wide and snaps to centre; a slide's tilt, scale and opacity interpolate continuously from its fractional distance to the centre, clamped at coverflow.maxSlots — so the deck reads as three cards at any slide count. Neighbours carry a transparent overlay button that centres them. Under prefers-reduced-motion the tilt and scale drop out and only the opacity remains. Falls back to the flat carousel below three slides and inside the Puck editor",
```

- [ ] **Step 4: Export ergänzen**

In `core/design-system/src/index.ts` die Export-Liste aus `./tokens` um `coverflow` und `type Coverflow` erweitern — alphabetisch nach `colors` einsortieren, damit die Liste sortiert bleibt.

- [ ] **Step 5: README ergänzen**

In `core/design-system/README.md` unmittelbar nach dem bestehenden **Carousel**-Absatz (endet um Zeile 76) einen zweiten Absatz einfügen:

```markdown
- **Carousel, Coverflow presentation** — the same rail, tilted into 3-D. The
  rail carries `coverflow.perspective`; each slide is `coverflow.slideWidthPct`
  of the rail wide and snaps to centre, so both neighbours peek in. Tilt, scale
  and opacity interpolate from a slide's fractional distance to the centre and
  stop getting more extreme past `coverflow.maxSlots` — the deck reads as three
  cards whatever the slide count. Neighbours carry a transparent overlay button
  that brings them to the centre. Under `prefers-reduced-motion` only the
  opacity survives. Below three slides, and inside the Puck editor, it falls
  back to the flat carousel.
```

- [ ] **Step 6: ADR schreiben**

`docs/decisions/0041-karussell-coverflow-darstellung.md` anlegen. Format an `docs/decisions/0040-karussell-ohne-neue-abhaengigkeit.md` orientieren (dort nachlesen: Titel, Status, Kontext, Entscheidung, Konsequenzen). Inhaltlich müssen mindestens diese vier Entscheidungen belegt sein:

1. **Variante statt zweitem Baustein.** Pfeile, Punkte, Einrast-Schiene und die Screenreader-Auszeichnung sind identisch; ein zweiter Block hätte sie dupliziert. Der Preis: der Baustein trägt jetzt zwei Darstellungen, die Komponente wird länger.
2. **Der Editor bleibt flach.** Puck ermittelt Ablegeziele über Mauskoordinaten; `transform` verschiebt die sichtbare Fläche gegenüber der Layout-Fläche. Um Drag & Drop nicht zu riskieren, erzwingt der Editor `klassisch`. Folge: der Vorstand beurteilt den Effekt in der Vorschau oder auf der veröffentlichten Seite, nicht im Bearbeitungs-Canvas.
3. **Unter drei Folien klassisch.** Ein Coverflow mit zwei Bildern hat keine Mitte; die Darstellung fällt still zurück statt kaputt auszusehen.
4. **Weiterhin keine neue Abhängigkeit.** Perspektive und Drehung sind CSS; die Interpolation ist eine reine Funktion über die Scroll-Position.

- [ ] **Step 7: Typecheck und Format**

```bash
pnpm --filter @bdas/design-system typecheck
pnpm exec prettier --check core/design-system/src/tokens.ts core/design-system/src/index.ts core/design-system/README.md docs/decisions/0041-karussell-coverflow-darstellung.md
```

Erwartet: beide ohne Befund. Bei Format-Befund `pnpm exec prettier --write <dateien>` und erneut prüfen.

- [ ] **Step 8: Commit**

```bash
git add core/design-system/src/tokens.ts core/design-system/src/index.ts core/design-system/README.md docs/decisions/0041-karussell-coverflow-darstellung.md
git commit -m "$(cat <<'EOF'
feat(design-system): tokens and recipe for the Coverflow carousel

ADR 0041. Plain numbers rather than CSS strings, because the tilt is
interpolated from a fractional distance rather than switched on and off.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Die reine Geometrie

Alles, was sich ausrechnen lässt, ohne den Browser zu fragen. happy-dom hat keine Layout-Engine — `clientWidth` ist dort 0 und `getBoundingClientRect()` liefert Nullen. Deshalb ist jede messende Logik hier eine reine Funktion, die Zahlen entgegennimmt; die Komponente in Task 3 liefert die Zahlen und wird selbst kaum noch getestet.

**Files:**
- Create: `apps/web/app/_content/karussell-darstellung.ts`
- Create: `apps/web/app/_content/karussell-darstellung.test.ts`
- Modify: `apps/web/app/_content/Karussell.tsx` (nur: `aktiveFolie` entfernen)
- Modify: `apps/web/app/_content/Karussell.test.tsx` (nur: Import umziehen)

**Interfaces:**
- Consumes: `coverflow` aus `@bdas/design-system` (Task 1).
- Produces:
  - `type Darstellung = "klassisch" | "coverflow"`
  - `type Beschriftung = "unter" | "auf" | "keine"`
  - `aktiveFolie(scrollLeft: number, abstand: number, anzahl: number): number`
  - `relativeLage(scrollLeft: number, abstand: number, index: number): number`
  - `coverflowStil(lage: number, reduziert: boolean): CSSProperties`
  - `effektiveDarstellung(darstellung: Darstellung | undefined, anzahl: number, imEditor: boolean): Darstellung`
  - `istBeschriftung(wert: unknown): wert is Beschriftung`

**Wichtig zur Bedeutungsänderung von `aktiveFolie`:** der zweite Parameter hieß bisher gedanklich „Breite der Schiene" und heißt jetzt **Folienabstand** (Folienbreite plus Lücke). In der klassischen Darstellung sind beide gleich groß, weshalb die bestehenden Testwerte unverändert gelten. In der Coverflow-Darstellung sind sie es nicht — und genau deshalb muss der Parameter umgedeutet werden. Nebenbei verschwindet damit ein bestehender Rundungsfehler: die Pfeile scrollten bisher um `clientWidth`, ließen die 24 px Lücke aber außer Acht, sodass sich der Versatz pro Folie aufsummierte.

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

`apps/web/app/_content/karussell-darstellung.test.ts` anlegen:

```ts
import { describe, expect, it } from "vitest";

import {
  aktiveFolie,
  coverflowStil,
  effektiveDarstellung,
  istBeschriftung,
  relativeLage,
} from "./karussell-darstellung";

describe("aktiveFolie", () => {
  it("names the slide nearest the centre, counting in slide pitch", () => {
    expect(aktiveFolie(0, 400, 5)).toBe(0);
    expect(aktiveFolie(400, 400, 5)).toBe(1);
    expect(aktiveFolie(1600, 400, 5)).toBe(4);
  });

  it("rounds to the nearer slide while a scroll is still settling", () => {
    expect(aktiveFolie(180, 400, 5)).toBe(0);
    expect(aktiveFolie(220, 400, 5)).toBe(1);
  });

  it("clamps at both ends, so an overscroll bounce names no slide that is not there", () => {
    expect(aktiveFolie(-1000, 400, 5)).toBe(0);
    expect(aktiveFolie(99_999, 400, 5)).toBe(4);
  });

  it("answers zero before the rail has been laid out", () => {
    expect(aktiveFolie(0, 0, 3)).toBe(0);
    expect(aktiveFolie(250, 0, 3)).toBe(0);
  });

  it("answers zero for an empty rail rather than a negative index", () => {
    expect(aktiveFolie(0, 400, 0)).toBe(0);
  });

  it("counts in pitch, so the gap between slides no longer accumulates", () => {
    // 300px slide + 24px gap. The fourth slide sits at 3 * 324, not 3 * 300 —
    // the old rail-width arithmetic drifted a gap per slide and eventually
    // named the wrong one.
    expect(aktiveFolie(972, 324, 6)).toBe(3);
  });
});

describe("relativeLage", () => {
  it("is zero for the slide sitting in the centre", () => {
    expect(relativeLage(800, 400, 2)).toBe(0);
  });

  it("is positive to the right of centre and negative to the left", () => {
    expect(relativeLage(800, 400, 3)).toBe(1);
    expect(relativeLage(800, 400, 1)).toBe(-1);
  });

  it("is fractional mid-swipe, which is what lets the tilt follow the finger", () => {
    expect(relativeLage(600, 400, 2)).toBe(0.5);
  });

  it("answers zero before the rail has been laid out", () => {
    expect(relativeLage(0, 0, 3)).toBe(0);
  });
});

describe("coverflowStil", () => {
  it("leaves the centred slide upright, opaque and on top", () => {
    const stil = coverflowStil(0, false);
    expect(stil.opacity).toBe(1);
    expect(stil.transform).toContain("rotateY(0deg)");
    expect(stil.transform).toContain("scale(1)");
  });

  it("tilts the two neighbours towards the centre, in opposite directions", () => {
    const rechts = coverflowStil(1, false);
    const links = coverflowStil(-1, false);
    expect(rechts.transform).toContain("rotateY(-38deg)");
    expect(links.transform).toContain("rotateY(38deg)");
  });

  it("shrinks and fades a neighbour", () => {
    const stil = coverflowStil(1, false);
    expect(stil.transform).toContain("scale(0.82)");
    expect(stil.opacity).toBe(0.55);
  });

  it("stops getting more extreme past the clamp, so the deck reads as three", () => {
    expect(coverflowStil(2, false)).toEqual(coverflowStil(9, false));
  });

  it("interpolates, so a half-swiped slide is half-tilted", () => {
    const stil = coverflowStil(0.5, false);
    expect(stil.transform).toContain("rotateY(-19deg)");
  });

  it("keeps the centred slide above its neighbours", () => {
    const mitte = Number(coverflowStil(0, false).zIndex);
    const nachbar = Number(coverflowStil(1, false).zIndex);
    expect(mitte).toBeGreaterThan(nachbar);
  });

  it("drops tilt and scale under reduced motion, keeping only the fade", () => {
    const stil = coverflowStil(1, true);
    expect(stil.transform).toBeUndefined();
    expect(stil.opacity).toBe(0.55);
  });
});

describe("effektiveDarstellung", () => {
  it("honours the board's choice with enough slides", () => {
    expect(effektiveDarstellung("coverflow", 3, false)).toBe("coverflow");
  });

  it("falls back below three slides, where there is no middle to speak of", () => {
    expect(effektiveDarstellung("coverflow", 2, false)).toBe("klassisch");
  });

  it("falls back inside the editor, where transforms break drag and drop", () => {
    expect(effektiveDarstellung("coverflow", 6, true)).toBe("klassisch");
  });

  it("treats a document saved before the field existed as classic", () => {
    expect(effektiveDarstellung(undefined, 6, false)).toBe("klassisch");
  });
});

describe("istBeschriftung", () => {
  it("accepts the three known placements", () => {
    expect(istBeschriftung("unter")).toBe(true);
    expect(istBeschriftung("auf")).toBe(true);
    expect(istBeschriftung("keine")).toBe(true);
  });

  it("rejects anything else, so a stale document falls back rather than throws", () => {
    expect(istBeschriftung(undefined)).toBe(false);
    expect(istBeschriftung("daneben")).toBe(false);
  });
});
```

- [ ] **Step 2: Lauf zur Bestätigung, dass es fehlschlägt**

```bash
pnpm exec vitest run apps/web/app/_content/karussell-darstellung.test.ts
```

Erwartet: FAIL, `Failed to resolve import "./karussell-darstellung"`.

- [ ] **Step 3: Das Modul schreiben**

`apps/web/app/_content/karussell-darstellung.ts` anlegen:

```ts
import { coverflow } from "@bdas/design-system";

import type { CSSProperties } from "react";

export type Darstellung = "klassisch" | "coverflow";
export type Beschriftung = "unter" | "auf" | "keine";

const BESCHRIFTUNGEN: ReadonlySet<string> = new Set(["unter", "auf", "keine"]);

export const istBeschriftung = (wert: unknown): wert is Beschriftung =>
  typeof wert === "string" && BESCHRIFTUNGEN.has(wert);

/**
 * Which slide sits nearest the centre of the rail.
 *
 * `abstand` is the slide *pitch* — one slide's width plus the gap to the next —
 * not the width of the rail. In the flat presentation the two are the same
 * number, which is why the older tests still read the same. In Coverflow a
 * slide is narrower than the rail on purpose, so the distinction is the whole
 * point. A rail that has not been laid out yet has pitch 0, and an empty rail
 * has no slide to name.
 */
export function aktiveFolie(scrollLeft: number, abstand: number, anzahl: number): number {
  if (abstand <= 0 || anzahl <= 0) return 0;
  const index = Math.round(scrollLeft / abstand);
  return Math.min(Math.max(index, 0), anzahl - 1);
}

/**
 * Where slide `index` sits relative to the centre, in slots, as a fraction.
 *
 * Zero is dead centre, +1 is one slot to the right, -0.5 is half a slot to the
 * left. The fraction is what makes the tilt follow the finger instead of
 * snapping over the moment the active index flips.
 */
export function relativeLage(scrollLeft: number, abstand: number, index: number): number {
  if (abstand <= 0) return 0;
  return (index * abstand - scrollLeft) / abstand;
}

/**
 * The 3-D presentation of a slide at fractional distance `lage`.
 *
 * Everything interpolates over the first slot and then stops: past
 * `coverflow.maxSlots` a slide looks exactly like the one before it, so a deck
 * of twelve reads the same as a deck of three. Slides further out are off the
 * column anyway.
 *
 * Under reduced motion the tilt and the scale drop out entirely — a fade is
 * information, a spinning deck is decoration.
 */
export function coverflowStil(lage: number, reduziert: boolean): CSSProperties {
  const gekappt = Math.max(Math.min(lage, coverflow.maxSlots), -coverflow.maxSlots);
  const betrag = Math.min(Math.abs(gekappt), 1);
  const deckkraft = 1 - betrag * (1 - coverflow.opacity);
  const zIndex = Math.round((coverflow.maxSlots - Math.abs(gekappt)) * 100);

  if (reduziert) return { opacity: deckkraft, zIndex };

  const winkel = -gekappt * coverflow.tiltDeg;
  const groesse = 1 - betrag * (1 - coverflow.scale);
  return {
    opacity: deckkraft,
    zIndex,
    transform: `rotateY(${Number(winkel.toFixed(2))}deg) scale(${Number(groesse.toFixed(4))})`,
  };
}

/**
 * The presentation actually rendered, which is not always the one chosen.
 *
 * Two overrides, both deliberate (ADR 0041): below three slides there is no
 * middle for the neighbours to flank, and inside the Puck editor a `transform`
 * moves a block's painted box away from its layout box, which is what drag and
 * drop hit-tests against.
 */
export function effektiveDarstellung(
  darstellung: Darstellung | undefined,
  anzahl: number,
  imEditor: boolean,
): Darstellung {
  if (darstellung !== "coverflow") return "klassisch";
  if (imEditor || anzahl < 3) return "klassisch";
  return "coverflow";
}
```

- [ ] **Step 4: Lauf zur Bestätigung, dass es besteht**

```bash
pnpm exec vitest run apps/web/app/_content/karussell-darstellung.test.ts
```

Erwartet: PASS, 23 Tests (6 + 4 + 7 + 4 + 2).

Sollte `coverflowStil(0.5, false)` nicht exakt `rotateY(-19deg)` liefern: `toFixed(2)` erzeugt `"-19.00"`, `Number(...)` macht daraus `-19`. Der String lautet also `rotateY(-19deg)`. Stimmt das nicht, liegt der Fehler in der Reihenfolge von `Number` und `toFixed` — nicht am Test.

- [ ] **Step 5: `aktiveFolie` aus der Komponente entfernen**

In `apps/web/app/_content/Karussell.tsx` die Funktion `aktiveFolie` samt ihrem Kommentarblock löschen (aktuell Zeilen 11–27) und stattdessen oben importieren:

```ts
import { aktiveFolie } from "./karussell-darstellung";
```

Kein Re-Export aus `Karussell.tsx`. CLAUDE.md §6 verbietet Verträglichkeits-Brücken für Code, den wir selbst geschrieben haben — die einzige Aufruferin ist die Testdatei, und die zieht im nächsten Schritt mit um.

- [ ] **Step 6: Test-Import umziehen**

In `apps/web/app/_content/Karussell.test.tsx`:
- Zeile 15 wird zu `import { Karussell, type Folie } from "./Karussell";`
- Der komplette `describe("aktiveFolie", …)`-Block (Zeilen 17–44) wird **gelöscht** — er lebt jetzt in `karussell-darstellung.test.ts`.
- Der einleitende Dateikommentar (Zeilen 1–7) sagt „The active-slide rule is pure and is tested as one." Das stimmt weiterhin, nur woanders. Den Satz anpassen zu: „The active-slide rule is pure and is tested in `karussell-darstellung.test.ts`."

- [ ] **Step 7: Beide Testdateien laufen lassen**

```bash
pnpm exec vitest run apps/web/app/_content/karussell-darstellung.test.ts apps/web/app/_content/Karussell.test.tsx
```

Erwartet: PASS. `Karussell.test.tsx` hat jetzt 14 Tests (19 minus die 5 umgezogenen), `karussell-darstellung.test.ts` hat 23.

- [ ] **Step 8: Typecheck, Lint, Format**

```bash
pnpm --filter @bdas/web typecheck
pnpm exec eslint apps/web/app/_content/karussell-darstellung.ts apps/web/app/_content/karussell-darstellung.test.ts apps/web/app/_content/Karussell.tsx apps/web/app/_content/Karussell.test.tsx
pnpm exec prettier --check apps/web/app/_content/karussell-darstellung.ts apps/web/app/_content/karussell-darstellung.test.ts apps/web/app/_content/Karussell.tsx apps/web/app/_content/Karussell.test.tsx
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/_content/karussell-darstellung.ts apps/web/app/_content/karussell-darstellung.test.ts apps/web/app/_content/Karussell.tsx apps/web/app/_content/Karussell.test.tsx
git commit -m "$(cat <<'EOF'
refactor(content): move the carousel's geometry into a pure module

aktiveFolie now counts in slide pitch rather than rail width. The two are
the same number in the flat presentation, but Coverflow makes a slide
narrower than its rail on purpose. Counting in pitch also drops the gap
that the arrow buttons used to lose, one slide at a time.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Die Komponente

Hier wird verdrahtet. Der Zustand schrumpft von zwei Werten (`aktiv`, `lebendig`) auf zwei andere (`scrollLeft`, `lebendig`) — die aktive Folie wird ab jetzt abgeleitet, nicht gespeichert, sonst könnten die beiden auseinanderlaufen.

**Files:**
- Modify: `apps/web/app/_content/Karussell.tsx`
- Modify: `apps/web/app/_content/Karussell.test.tsx`

**Interfaces:**
- Consumes: alles aus `./karussell-darstellung` (Task 2), `coverflow` aus `@bdas/design-system` (Task 1).
- Produces: `Karussell` nimmt zwei neue optionale Props entgegen:
  ```ts
  export function Karussell({
    ueberschrift,
    folien,
    darstellung,
    beschriftung,
    imEditor,
  }: {
    ueberschrift: string;
    folien: Folie[];
    darstellung?: Darstellung | undefined;
    beschriftung?: Beschriftung | undefined;
    imEditor?: boolean | undefined;
  })
  ```
  Alle drei optional, damit bestehende Aufrufe und Tests unverändert weiterlaufen. Task 4 reicht sie aus Puck durch.

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

In `apps/web/app/_content/Karussell.test.tsx` am Ende des `describe("Karussell, server-rendered", …)`-Blocks ergänzen:

```tsx
  it("stays flat unless the board asked for Coverflow", () => {
    const out = renderToStaticMarkup(
      <Karussell ueberschrift="" folien={[folie("A"), folie("B"), folie("C")]} />,
    );
    expect(out).not.toContain("perspective");
  });

  it("builds the 3-D scene once Coverflow is chosen", () => {
    const out = renderToStaticMarkup(
      <Karussell
        ueberschrift=""
        darstellung="coverflow"
        folien={[folie("A"), folie("B"), folie("C")]}
      />,
    );
    expect(out).toContain("perspective:1200px");
  });

  it("falls back to flat below three slides", () => {
    const out = renderToStaticMarkup(
      <Karussell ueberschrift="" darstellung="coverflow" folien={[folie("A"), folie("B")]} />,
    );
    expect(out).not.toContain("perspective");
  });

  it("falls back to flat inside the editor, to keep drag and drop honest", () => {
    const out = renderToStaticMarkup(
      <Karussell
        ueberschrift=""
        darstellung="coverflow"
        imEditor
        folien={[folie("A"), folie("B"), folie("C")]}
      />,
    );
    expect(out).not.toContain("perspective");
  });

  it("loads the first image eagerly and the rest only when approached", () => {
    // Coverflow shows several slides at once, so every image would otherwise
    // be fetched on load. Six 1080px photos on a phone is the case this
    // guards against.
    const out = renderToStaticMarkup(
      <Karussell
        ueberschrift=""
        darstellung="coverflow"
        folien={[
          folie("A", "https://cdn.example/a.webp"),
          folie("B", "https://cdn.example/b.webp"),
          folie("C", "https://cdn.example/c.webp"),
        ]}
      />,
    );
    expect((out.match(/loading="lazy"/g) ?? []).length).toBe(2);
    expect((out.match(/loading="eager"/g) ?? []).length).toBe(1);
  });

  it("puts the caption under the rail by default, for the centred slide only", () => {
    const out = renderToStaticMarkup(
      <Karussell
        ueberschrift=""
        darstellung="coverflow"
        beschriftung="unter"
        folien={[folie("Erste"), folie("Zweite"), folie("Dritte")]}
      />,
    );
    expect((out.match(/Erste in einem Satz\./g) ?? []).length).toBe(1);
    expect(out).not.toContain("Zweite in einem Satz.");
  });

  it("drops the caption entirely when the board asked for none", () => {
    const out = renderToStaticMarkup(
      <Karussell
        ueberschrift=""
        darstellung="coverflow"
        beschriftung="keine"
        folien={[folie("Erste"), folie("Zweite"), folie("Dritte")]}
      />,
    );
    expect(out).not.toContain("Erste");
  });

  it("lays the caption over every image when asked to", () => {
    const out = renderToStaticMarkup(
      <Karussell
        ueberschrift=""
        darstellung="coverflow"
        beschriftung="auf"
        folien={[folie("Erste"), folie("Zweite"), folie("Dritte")]}
      />,
    );
    expect(out).toContain("Erste");
    expect(out).toContain("Zweite");
  });
```

Und im `describe("Karussell, alive in a DOM", …)`-Block ergänzen:

```tsx
  it("grows an overlay button per off-centre slide once alive", () => {
    // The image itself is never re-parented — the button is a sibling laid
    // over it — so hydration does not restart an in-flight image load.
    const knoepfe = () =>
      Array.from(container.querySelectorAll("[data-karussell-sprung]")).length;
    expect(knoepfe()).toBeGreaterThan(0);
  });
```

**Hinweis an die ausführende Person:** die Hilfsvariablen `container`, `root` und das `beforeEach`/`afterEach`-Gerüst dieses Blocks sind bereits vorhanden (Zeilen 125–150 der heutigen Datei). Vor dem Schreiben dieses Tests die vorhandene `beforeEach` lesen und die Folienzahl so wählen, dass Coverflow greift (mindestens drei) — gegebenenfalls einen eigenen kleinen Render innerhalb des Tests aufsetzen, statt das gemeinsame Gerüst umzubauen.

- [ ] **Step 2: Lauf zur Bestätigung, dass es fehlschlägt**

```bash
pnpm exec vitest run apps/web/app/_content/Karussell.test.tsx
```

Erwartet: FAIL — `perspective` fehlt, `loading` fehlt, Beschriftungen fehlen.

- [ ] **Step 3: Die Komponente umbauen**

`apps/web/app/_content/Karussell.tsx` überarbeiten. Leitplanken, die dabei einzuhalten sind:

1. **Zustand.** `const [scrollLeft, setScrollLeft] = React.useState(0)` und `const [abstand, setAbstand] = React.useState(0)` ersetzen das bisherige `aktiv`. `lebendig` bleibt. Die aktive Folie wird abgeleitet: `const aktiv = aktiveFolie(scrollLeft, abstand, liste.length)`.

2. **Messen ohne Beobachter.** Den Folienabstand aus den ersten beiden `<li>` lesen:
   ```ts
   const messeAbstand = (el: HTMLUListElement): number => {
     const kinder = el.children;
     if (kinder.length >= 2) {
       return (kinder[1] as HTMLElement).offsetLeft - (kinder[0] as HTMLElement).offsetLeft;
     }
     return (kinder[0] as HTMLElement | undefined)?.offsetWidth ?? 0;
   };
   ```
   Aufrufen im Mount-Effekt, im Scroll-Handler und in einem `resize`-Listener auf `window`. **Kein `ResizeObserver`** — happy-dom bringt ihn nicht zuverlässig mit, und drei Aufrufstellen genügen.

3. **Flüssiges Mitdrehen.** Der Scroll-Handler darf nicht pro Ereignis neu rendern. Mit `requestAnimationFrame` entprellen: eine Ref hält die laufende Bild-Anforderung, der Handler plant höchstens eine ein und liest darin `scrollLeft` und den Abstand. Die Ref im Aufräumschritt des Effekts mit `cancelAnimationFrame` freigeben.

4. **Reduzierte Bewegung.** `const reduziert = React.useRef(false)` und im Mount-Effekt `reduziert.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches` — exakt das Muster aus `apps/web/app/_public/landing/HeroSlideshow.tsx:14-18`. Beim ersten Rendern auf dem Server ist der Wert `false`; das ist richtig so, denn dort gibt es keine Bewegung zu reduzieren.

5. **Blättern.** `gehZu` und `schiebe` rechnen ab jetzt mit `abstand` statt `el.clientWidth`:
   ```ts
   const gehZu = (index: number) => schiene.current?.scrollTo({ left: index * abstand, behavior: "smooth" });
   const schiebe = (richtung: -1 | 1) => schiene.current?.scrollBy({ left: richtung * abstand, behavior: "smooth" });
   ```

6. **Die Schiene.** In Coverflow bekommt das `<ul>` `style={{ perspective: `${coverflow.perspective}px`, paddingInline: `${(100 - coverflow.slideWidthPct) / 2}%` }}` und zusätzlich die Klasse `py-8` — gedrehte Folien ragen nach oben und unten heraus, und `overflow-x-auto` würde sie sonst kappen. In der klassischen Darstellung bleibt alles wie heute. Die Klasse `min-w-0` auf dem `<section>` **muss erhalten bleiben**: sie verhindert, dass der Baustein in einem `Spalten`-Block die Handy-Seite sprengt (der Kommentar dort erklärt es).

7. **Die Folie.** In Coverflow trägt das `<li>` `style={{ width: `${coverflow.slideWidthPct}%`, ...coverflowStil(relativeLage(scrollLeft, abstand, i), reduziert.current) }}` und die Klassen `relative shrink-0 snap-center transition-none`. `w-full` und das `sm:flex`-Nebeneinander entfallen hier — das ist die klassische Anordnung. Für `transform-style` und weiche Kanten zusätzlich `[transform-style:preserve-3d]` setzen.

8. **Die Sprung-Schaltfläche.** Nur wenn `lebendig` **und** Coverstyle aktiv: als Geschwister *neben* dem `<img>`, nicht darum herum:
   ```tsx
   <button
     type="button"
     data-karussell-sprung
     aria-label={`Zu Folie ${i + 1} von ${liste.length} springen`}
     disabled={i === aktiv}
     onClick={() => gehZu(i)}
     className="absolute inset-0 rounded-bdas disabled:pointer-events-none"
   />
   ```
   Das Bild wird dadurch nie umgehängt und ein laufender Ladevorgang nie neu gestartet. Vor der Hydrierung entsteht keine Schaltfläche — der bestehende Test „offers no controls before it is alive" bleibt gültig.

9. **Bilder.** `loading={i === 0 ? "eager" : "lazy"}` und `decoding="async"`. Feste Maße sind nicht nötig, `aspect-video` reserviert den Platz bereits.

10. **Beschriftungen.** Der Wert wird zuerst abgesichert, denn Dokumente, die vor diesem Feld gespeichert wurden, liefern `undefined`:
   ```ts
   const platzierung = istBeschriftung(beschriftung) ? beschriftung : "unter";
   ```
   Bei `keine` entfallen Titel und Text vollständig. Bei `auf` liegen sie in jeder Folie absolut über dem Bild, mit `bg-bdas-hero-scrim` als Abdunklung — dieses Token existiert und wird schon von `Hero.tsx:102` genutzt. Bei `unter` steht unter der Schiene nur der Text der aktiven Folie, mit `key={aktiv}` und der Klasse `animate-bdas-fade-slide-up`, damit der Wechsel nicht hart springt; auch dieses Token existiert bereits.

11. **Die klassische Darstellung bleibt Zeile für Zeile, wie sie ist.** Die bestehenden 14 Tests sind der Beleg. Wenn einer davon rot wird, ist das ein Fehler im Umbau, keine erwartete Änderung.

- [ ] **Step 4: Lauf zur Bestätigung, dass alles besteht**

```bash
pnpm exec vitest run apps/web/app/_content/karussell-darstellung.test.ts apps/web/app/_content/Karussell.test.tsx
```

Erwartet: PASS, alle Tests beider Dateien.

- [ ] **Step 5: Typecheck, Lint, Format**

```bash
pnpm --filter @bdas/web typecheck
pnpm exec eslint apps/web/app/_content/Karussell.tsx apps/web/app/_content/Karussell.test.tsx
pnpm exec prettier --check apps/web/app/_content/Karussell.tsx apps/web/app/_content/Karussell.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_content/Karussell.tsx apps/web/app/_content/Karussell.test.tsx
git commit -m "$(cat <<'EOF'
feat(content): the carousel's Coverflow presentation

Tilt, scale and opacity interpolate from the live scroll position, so the
deck follows the finger instead of snapping over when the active index
flips. Off-centre slides carry an overlay button rather than wrapping the
image, which keeps hydration from restarting an in-flight image load.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Die Felder im Editor

**Files:**
- Modify: `apps/web/app/_content/puck-config.tsx:85` (Typ `Blocks`)
- Modify: `apps/web/app/_content/puck-config.tsx:925-952` (Block `Karussell`)
- Modify: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**
- Consumes: `Karussell` mit den drei neuen Props (Task 3), `Darstellung`/`Beschriftung` (Task 2).
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

In `apps/web/app/_content/puck-config.test.ts` einen neuen Block ergänzen, im Stil der vorhandenen `describe("Hero block", …)`:

```ts
describe("Karussell block", () => {
  const feld = (name: string) =>
    (puckConfig.components.Karussell.fields as Record<string, { options?: { value: string }[] }>)[
      name
    ];

  it("offers both presentations, classic first", () => {
    expect(feld("darstellung").options?.map((o) => o.value)).toEqual(["klassisch", "coverflow"]);
  });

  it("defaults to classic, so published pages do not change under the board", () => {
    expect(puckConfig.components.Karussell.defaultProps?.darstellung).toBe("klassisch");
  });

  it("offers the three caption placements", () => {
    expect(feld("beschriftung").options?.map((o) => o.value)).toEqual(["unter", "auf", "keine"]);
  });

  it("hides the caption field while the presentation is classic", () => {
    const resolve = puckConfig.components.Karussell.resolveFields;
    expect(resolve).toBeDefined();
    const felder = resolve!(
      { props: { id: "x", darstellung: "klassisch", beschriftung: "unter", folien: [] } },
      { fields: puckConfig.components.Karussell.fields } as never,
    );
    expect(Object.keys(felder)).not.toContain("beschriftung");
  });

  it("shows the caption field once Coverflow is chosen", () => {
    const resolve = puckConfig.components.Karussell.resolveFields;
    const felder = resolve!(
      { props: { id: "x", darstellung: "coverflow", beschriftung: "unter", folien: [] } },
      { fields: puckConfig.components.Karussell.fields } as never,
    );
    expect(Object.keys(felder)).toContain("beschriftung");
  });
});
```

**Hinweis:** `resolveFields` darf laut Puck-Typ auch ein `Promise` liefern. Wir geben synchron zurück; falls TypeScript im Test meckert, das Ergebnis mit `as Record<string, unknown>` einengen statt die Signatur zu ändern.

- [ ] **Step 2: Lauf zur Bestätigung, dass es fehlschlägt**

```bash
pnpm exec vitest run apps/web/app/_content/puck-config.test.ts
```

Erwartet: FAIL — `feld("darstellung")` ist `undefined`.

- [ ] **Step 3: Den Typ erweitern**

In `apps/web/app/_content/puck-config.tsx` Zeile 85:

```ts
  Karussell: {
    ueberschrift: string;
    folien: Folie[];
    darstellung: Darstellung;
    beschriftung: Beschriftung;
  };
```

und oben `import type { Beschriftung, Darstellung } from "./karussell-darstellung";` ergänzen.

- [ ] **Step 4: Den Block erweitern**

Den `Karussell`-Eintrag (Zeilen 925–952) ersetzen. Reihenfolge der Felder: Überschrift, Darstellung, Beschriftung, Folien — die Darstellung steht vor den Folien, weil sie bestimmt, was die Folien-Felder überhaupt bewirken.

```tsx
    Karussell: {
      label: "Karussell",
      fields: {
        ueberschrift: { type: "text", label: "Überschrift (optional)" },
        darstellung: {
          type: "select",
          label: "Darstellung",
          options: [
            { label: "Klassisch", value: "klassisch" },
            { label: "Coverflow (3D)", value: "coverflow" },
          ],
        },
        beschriftung: {
          type: "select",
          label: "Titel und Text",
          options: [
            { label: "Unter dem Karussell", value: "unter" },
            { label: "Auf dem Bild", value: "auf" },
            { label: "Ausblenden", value: "keine" },
          ],
        },
        folien: {
          type: "array",
          label: "Folien",
          arrayFields: {
            bild: {
              type: "custom",
              label: "Bild (optional)",
              render: ({ value, onChange }) => <FotoField value={value} onChange={onChange} />,
            },
            titel: { type: "text", label: "Titel" },
            text: { type: "textarea", label: "Text" },
          },
          defaultItemProps: { bild: "", titel: "", text: "" },
          getItemSummary: (f) => f.titel || "Neue Folie",
        },
      },
      // The caption placement only means anything in Coverflow — the flat
      // presentation has always put the text beside the image. Asking the
      // board a question that changes nothing is worse than not asking.
      resolveFields: (data, { fields }) => {
        if (data.props?.darstellung !== "coverflow") {
          const { beschriftung: _weg, ...rest } = fields;
          return rest;
        }
        return fields;
      },
      defaultProps: {
        ueberschrift: "",
        darstellung: "klassisch",
        beschriftung: "unter",
        folien: [],
      },
      render: ({ ueberschrift, darstellung, beschriftung, folien, puck }) =>
        (folien ?? []).length === 0 && puck?.isEditing ? (
          <BlockPlatzhalter titel="Karussell" hinweis="Noch keine Folien hinzugefügt." />
        ) : (
          <Karussell
            ueberschrift={ueberschrift}
            folien={folien}
            darstellung={darstellung}
            beschriftung={beschriftung}
            imEditor={puck?.isEditing ?? false}
          />
        ),
    },
```

- [ ] **Step 5: Lauf zur Bestätigung, dass es besteht**

```bash
pnpm exec vitest run apps/web/app/_content/puck-config.test.ts
```

Erwartet: PASS. Schlägt ein *bestehender* Test fehl, liegt das fast sicher an einer Momentaufnahme der Feldliste — dann die Erwartung um die beiden neuen Felder ergänzen, nicht die Felder wieder entfernen.

- [ ] **Step 6: Alle drei Testdateien, Typecheck, Lint, Format**

```bash
pnpm exec vitest run apps/web/app/_content/karussell-darstellung.test.ts apps/web/app/_content/Karussell.test.tsx apps/web/app/_content/puck-config.test.ts
pnpm --filter @bdas/web typecheck
pnpm exec eslint apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
pnpm exec prettier --check apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "$(cat <<'EOF'
feat(content): let the board choose the carousel's presentation

Two selects on the existing block rather than a second block. The caption
placement only appears once Coverflow is chosen, since the flat rail has
always put the text beside the image.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Sichtprüfung am echten Gerät-Viewport

Der Effekt ist visuell; Vitest kann ihn nicht beurteilen, weil happy-dom nicht rechnet. Diese Task erzeugt die Belege, die der Nutzer sehen will, und prüft insbesondere, dass die Handy-Breite heil bleibt — genau dort wurde am 2026-09-10 ein Überlauf behoben (`min-w-0`, PR #221), und Coverflow fasst dieselbe Stelle an.

**Files:**
- Keine Änderungen am Repository. Das Prüfskript liegt unter `/tmp` und wird am Ende gelöscht.

**Interfaces:**
- Consumes: den fertigen Stand aus Tasks 1–4.
- Produces: zwei Screenshots und eine Messtabelle für den Nutzer.

- [ ] **Step 1: Bauen**

```bash
pnpm --filter @bdas/web build
```

Erwartet: erfolgreicher Build. Schlägt er fehl, gehört der Fehler in die Task, die ihn verursacht hat — nicht hier geflickt.

- [ ] **Step 2: Entwicklungsserver starten**

```bash
pnpm --filter @bdas/web dev
```

**Achtung:** Ein bereits laufender Server auf Port 3000 wird stillschweigend mitbenutzt und zeigt dann alten Code. Vorher prüfen: `lsof -ti:3000`. Liefert das eine Prozessnummer, den Nutzer fragen, ob der Prozess beendet werden darf — nicht ungefragt abschießen.

- [ ] **Step 3: Eine Prüfseite mit Coverflow herstellen**

Die Live-Inhalte liegen in der Datenbank, nicht im Repository; lokal ist `/ueber-uns` daher womöglich leer. Statt die Datenbank anzufassen: eine wegwerfbare Route unter `apps/web/app/coverflow-probe/page.tsx` anlegen, die `<Karussell>` direkt mit sechs Platzhalterbildern und `darstellung="coverflow"` rendert. **Diese Datei wird in Step 6 wieder gelöscht und niemals committet.**

- [ ] **Step 4: Messen und knipsen**

Ein Playwright-Skript nach `/tmp/coverflow-probe.mjs` schreiben. Playwright liegt nicht im Wurzelverzeichnis; der Import muss auf den pnpm-Pfad zeigen:

```js
import { chromium, devices } from "/Users/bojack/Documents/Projects/Bdas_website/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs";
```

Das Skript soll für iPhone 13 (390 px) und für 1280 px Breite jeweils:
- `document.documentElement.scrollWidth` und `window.innerWidth` auslesen,
- die Breite des `[aria-roledescription="Karussell"]`-Abschnitts und einer Folie messen,
- einen Screenshot ablegen (`/tmp/coverflow-390.png`, `/tmp/coverflow-1280.png`).

**Abnahmekriterium, hart:** bei 390 px muss `scrollWidth === innerWidth === 390` gelten. Jeder größere Wert bedeutet, dass die Seite wieder überläuft und der Effekt so nicht ausgeliefert werden darf.

- [ ] **Step 5: Screenshots ansehen und dem Nutzer vorlegen**

Beide Bilder mit dem Read-Werkzeug öffnen und selbst beurteilen: Sind die Nachbarn erkennbar weggedreht? Ist die mittige Folie scharf und vollständig? Werden gedrehte Ecken oben oder unten abgeschnitten? Dann dem Nutzer die Messwerte und den Befund berichten — die Entscheidung über die Handy-Optik hat er sich vorbehalten.

- [ ] **Step 6: Aufräumen**

```bash
rm -rf apps/web/app/coverflow-probe
rm -f /tmp/coverflow-probe.mjs /tmp/coverflow-390.png /tmp/coverflow-1280.png
git status --short
```

Erwartet: sauberer Arbeitsbaum. Die Prüfroute darf unter keinen Umständen in einem Commit landen.

---

## Abschluss

Ist Task 5 abgenommen, steht der Zweig `feat/karussell-coverflow` mit vier Commits bereit. Vor dem Pull Request:

```bash
pnpm exec vitest run apps/web/app/_content/karussell-darstellung.test.ts apps/web/app/_content/Karussell.test.tsx apps/web/app/_content/puck-config.test.ts
pnpm --filter @bdas/web typecheck
pnpm --filter @bdas/design-system typecheck
pnpm exec eslint apps/web core/design-system
pnpm exec prettier --check .
```

Den Pull Request erst nach ausdrücklicher Freigabe des Nutzers öffnen. Laut CLAUDE.md §4 gehört auf diesen Zweig zusätzlich ein `/review`.

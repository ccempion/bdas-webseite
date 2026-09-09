# Content-Seiten Layout-Erweiterung — PR5 (Karussell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein durchklickbares Karussell als letzter Block der Palette-Erweiterung — eine Folie pro Sichtfeld, Bild links und Text rechts, Pfeile und Punkte, ohne eine einzige neue Laufzeit-Abhängigkeit.

**Architecture:** Die Schiene ist ein horizontaler CSS-Scroll-Container mit `snap-x snap-mandatory`; Wischen, Schwung und Pfeiltasten liefert der Browser. Pfeil-Buttons rufen `scrollBy`, Punkte `scrollTo`. Welche Folie aktiv ist, entscheidet eine reine Funktion über `scrollLeft` und Schienenbreite — keine Messung, kein Observer, testbar ohne Layout-Engine. Bedienelemente erscheinen erst nach dem Mount, damit ohne JavaScript keine toten Knöpfe herumstehen; die Schiene selbst ist serverseitig gerendert und von Hand scrollbar.

**Tech Stack:** TypeScript, Next.js 14 App Router, React 18, Tailwind, Puck `^0.23.0`, Vitest (node + happy-dom), `core/design-system`-Tokens. **Keine neue Abhängigkeit.**

**Spec:** [`docs/superpowers/specs/2026-09-08-content-pages-layout-erweiterung-design.md`](../specs/2026-09-08-content-pages-layout-erweiterung-design.md) — §6 (Karussell), §7 (Rezept), §8 (Abhängigkeit), §10 (PR 5), §11 (Tests). ADR [`0036`](../../decisions/0036-puck-freeform-layout-and-block-expansion.md).

## Global Constraints

- **Keine neue Laufzeit-Abhängigkeit.** Spec §8 sah `embla-carousel-react` über die shadcn-CLI vor; dieser Weg existiert im Repo nicht (keine `components.json`, die Primitives in `core/design-system/src/components/` sind Handarbeit). Die Abweichung wird in Task 5 als ADR 0039 festgehalten.
- **Kein Autoplay, kein Loop** (Spec §6). Am Anfang und am Ende sind die Pfeile `disabled`.
- **Kein Hex, kein Radius, keine Dauer ad hoc** (CLAUDE.md §7). Alles über Tailwind-Klassen, die auf `core/design-system`-Tokens zeigen (`bg-bdas-red`, `text-bdas-ink`, `text-bdas-ink-body`, `rounded-full`).
- **Kein `dangerouslySetInnerHTML`, keine Freitext-Styling-Props** (Spec §6, letzter Absatz).
- **Tailwind-Klassen immer als literale Strings**, nie interpoliert — der Scanner sieht interpolierte Klassen nicht (Muster: `KARTEN_GRID` in `KartenRaster.tsx`).
- **Vitest kompiliert JSX mit dem klassischen Runtime:** jede `.tsx`-Datei braucht `import React from "react"`, sonst „React is not defined".
- Node ≥ 22.5. Befehle laufen aus dem Worktree-Wurzelverzeichnis.
- Jeder Commit endet mit `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

| Datei | Verantwortung |
| --- | --- |
| `core/design-system/src/tokens.ts` | `recipes.carousel` — die eine Stelle, die sagt, wie ein Karussell im BDAS-System aussieht |
| `core/design-system/README.md` | dieselbe Regel in Prosa, im Abschnitt „Component recipes" |
| `apps/web/app/_content/Karussell.tsx` | die reinen Regeln **und** die Client-Komponente; rein präsentational, kennt keine Puck-Typen |
| `apps/web/app/_content/Karussell.test.tsx` | Regeln (node) und Verdrahtung (happy-dom) |
| `apps/web/app/_content/puck-config.tsx` | Block-Typ, Felder, Registrierung, Leerzustand |
| `apps/web/app/_content/puck-config.test.ts` | der Block im Katalog |
| `docs/decisions/0039-karussell-ohne-neue-abhaengigkeit.md` | warum kein embla, und die zwei Rezept-Abweichungen von §7 |

Regeln und Komponente teilen sich `Karussell.tsx`, weil das Haus es so hält: `kartenGrid` steht in `KartenRaster.tsx`, `panelIsDue` in `NewsletterScrollPanel.tsx`. Eine eigene Regeldatei wäre eine Erfindung ohne Vorbild.

---

## Task 1: Das Karussell-Rezept ins Design-System

Spec §7 verlangt, das Rezept zu beschließen, **bevor** ein Block es konsumiert. Diese Task hat bewusst keinen Unit-Test — sie liefert einen Token-String und einen README-Absatz; ihr Tor sind `typecheck`, `lint`, `format:check` und das Review.

**Files:**
- Modify: `core/design-system/src/tokens.ts` (im `recipes`-Objekt, nach `accordion`)
- Modify: `core/design-system/README.md` (Abschnitt „Component recipes", nach dem Accordion-Eintrag)

**Interfaces:**
- Consumes: nichts
- Produces: `recipes.carousel: string` — Task 3 und Task 5 zitieren es

- [ ] **Step 1: Rezept in `tokens.ts` ergänzen**

In `core/design-system/src/tokens.ts`, im `recipes`-Objekt zwischen `accordion` und `liftHover`:

```ts
  carousel:
    "horizontal snap rail (snap-x snap-mandatory), one slide per view; dots radius full, active dot brand.red, colour transition durationQuick; arrow buttons follow liftHover and are disabled at both ends — no loop, no autoplay; the slide change is a native smooth scroll, so its duration belongs to the browser, not to a token",
```

- [ ] **Step 2: Denselben Eintrag im README beschreiben**

In `core/design-system/README.md`, im Abschnitt „Component recipes", nach dem Accordion-Punkt:

```markdown
- **Carousel** — a horizontal snap rail (`snap-x snap-mandatory`) showing one
  slide per view; the browser supplies swipe, momentum and arrow keys. Dots use
  `radii.full` (the scale reserves it for "markers, dots"), the active one in
  `brand.red` with a `motion.durationQuick` colour transition. Arrow buttons
  follow **liftHover** and are disabled at the first and last slide — the rail
  never loops and never advances on its own. The slide change is a native
  smooth scroll: its duration is the browser's, which is why no motion token
  names it. Two deliberate departures from the original proposal are recorded
  in ADR 0039.
```

- [ ] **Step 3: Prüfen, dass nichts kaputt ist**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: alle drei ohne Befund.

- [ ] **Step 4: Commit**

```bash
git add core/design-system/src/tokens.ts core/design-system/README.md
git commit -m "$(cat <<'EOF'
feat(design-system): carousel recipe

Spec §7 will das Rezept beschlossen haben, bevor ein Block es konsumiert —
sonst entsteht das Muster im Block und wandert nie zurück.

Zwei Punkte weichen bewusst vom Vorschlag in §7 ab. Die Punkte bekommen
radii.full statt des Pill-Radius: die Token-Skala reserviert full ausdrücklich
für „markers, dots". Und der Folienwechsel nennt keine Dauer, weil ein nativer
Smooth-Scroll keine annimmt — eine Zahl, die nichts steuert, gehört nicht in
ein Rezept.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Die reinen Regeln

**Files:**
- Create: `apps/web/app/_content/Karussell.tsx`
- Create: `apps/web/app/_content/Karussell.test.tsx`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `export type Folie = { bild: string; titel: string; text: string }`
  - `export function aktiveFolie(scrollLeft: number, breite: number, anzahl: number): number`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`apps/web/app/_content/Karussell.test.tsx`. **Ohne `import React`** — in dieser Task steht noch kein JSX in der Datei, und ein ungenutzter Import fällt bei `pnpm lint` durch. Task 3 bringt ihn mit, wenn JSX dazukommt:

```tsx
import { describe, expect, it } from "vitest";

import { aktiveFolie } from "./Karussell";

describe("aktiveFolie", () => {
  it("names the slide that fills the rail", () => {
    expect(aktiveFolie(0, 400, 5)).toBe(0);
    expect(aktiveFolie(400, 400, 5)).toBe(1);
    expect(aktiveFolie(1600, 400, 5)).toBe(4);
  });

  it("rounds to the nearer slide while a scroll is still settling", () => {
    expect(aktiveFolie(180, 400, 5)).toBe(0);
    expect(aktiveFolie(220, 400, 5)).toBe(1);
  });

  it("clamps at both ends, so an overscroll bounce names no slide that is not there", () => {
    expect(aktiveFolie(-120, 400, 5)).toBe(0);
    expect(aktiveFolie(99_999, 400, 5)).toBe(4);
  });

  it("answers zero before the rail has a width", () => {
    // First render, and every test environment without a layout engine:
    // clientWidth is 0 and the division would be Infinity or NaN.
    expect(aktiveFolie(0, 0, 3)).toBe(0);
    expect(aktiveFolie(250, 0, 3)).toBe(0);
  });

  it("answers zero for an empty rail rather than a negative index", () => {
    expect(aktiveFolie(0, 400, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm vitest run apps/web/app/_content/Karussell.test.tsx`
Expected: FAIL — `Failed to resolve import "./Karussell"`.

- [ ] **Step 3: Die Regel schreiben**

`apps/web/app/_content/Karussell.tsx`. Auch hier **noch kein `import React`** — die Regel ist reines TypeScript; Task 3 fügt den Import mit der Komponente hinzu. Das `"use client"` steht von Anfang an, weil die Datei ab Task 3 eine Client-Insel ist:

```tsx
"use client";

export type Folie = {
  bild: string;
  titel: string;
  text: string;
};

/**
 * Which slide fills the rail right now, from the rail's own two numbers.
 *
 * Every slide is exactly one rail-width wide (`w-full shrink-0`), so this is
 * division rather than measurement — no observer, no element rectangles, and
 * therefore a pure function that a test can pin down without a layout engine.
 * `panelIsDue` in `NewsletterScrollPanel.tsx` is the same idea: the rule is
 * testable where it is written, and the DOM only supplies the numbers.
 *
 * Total over the degenerate cases: a rail that has not been laid out yet has
 * width 0, and an empty rail has no slide to name.
 */
export function aktiveFolie(scrollLeft: number, breite: number, anzahl: number): number {
  if (breite <= 0 || anzahl <= 0) return 0;
  const index = Math.round(scrollLeft / breite);
  return Math.min(Math.max(index, 0), anzahl - 1);
}
```

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

Run: `pnpm vitest run apps/web/app/_content/Karussell.test.tsx`
Expected: PASS, 5 Tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content/Karussell.tsx apps/web/app/_content/Karussell.test.tsx
git commit -m "$(cat <<'EOF'
feat(content): the carousel's active-slide rule

Eine Folie ist genau eine Schienenbreite breit, also ist die aktive Folie eine
Division und keine Messung. Das hält die Regel rein und damit prüfbar ohne
Layout-Engine — happy-dom hat keine, und ein IntersectionObserver wäre dort
ohnehin nur gestubbt.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Die Komponente

**Files:**
- Modify: `apps/web/app/_content/Karussell.tsx`
- Modify: `apps/web/app/_content/Karussell.test.tsx`

**Interfaces:**
- Consumes: `aktiveFolie`, `Folie` aus Task 2
- Produces: `export function Karussell({ ueberschrift, folien }: { ueberschrift: string; folien: Folie[] }): JSX.Element | null`

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

An `apps/web/app/_content/Karussell.test.tsx` anhängen. Die Datei bekommt dafür oben den happy-dom-Docblock — **Zeile 1**, vor allen Imports:

```tsx
/**
 * @vitest-environment happy-dom
 *
 * The active-slide rule is pure and is tested as one. What needs a DOM is the
 * wiring around it: that the controls appear only once the component is alive,
 * and that a click on an arrow or a dot moves the rail rather than the page.
 */
```

Die Imports um React (jetzt steht JSX in der Datei), `act`, `createRoot` und die Komponente erweitern:

```tsx
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aktiveFolie, Karussell, type Folie } from "./Karussell";
```

Und diese Blöcke ans Dateiende:

```tsx
const folie = (titel: string, bild = ""): Folie => ({
  bild,
  titel,
  text: `${titel} in einem Satz.`,
});

describe("Karussell, server-rendered", () => {
  it("puts every slide on the page, in order", () => {
    const out = renderToStaticMarkup(
      <Karussell ueberschrift="" folien={[folie("Solidarität"), folie("Vielfalt")]} />,
    );
    expect(out.indexOf("Solidarität")).toBeLessThan(out.indexOf("Vielfalt"));
    expect((out.match(/<li/g) ?? []).length).toBe(2);
  });

  it("offers no controls before it is alive", () => {
    // Arrows and dots do nothing without JavaScript. A rail that can still be
    // swiped and scrolled by hand is the honest fallback; dead buttons are not.
    const out = renderToStaticMarkup(<Karussell ueberschrift="" folien={[folie("Eins")]} />);
    expect(out).not.toContain("<button");
    expect(out).toContain("snap-x");
  });

  it("shows an image only when the slide has one, and marks it decorative", () => {
    const mit = renderToStaticMarkup(
      <Karussell ueberschrift="" folien={[folie("Solidarität", "https://cdn.example/a.webp")]} />,
    );
    expect(mit).toContain('src="https://cdn.example/a.webp"');
    expect(mit).toContain('alt=""');
    expect(mit).toContain("aria-hidden");

    const ohne = renderToStaticMarkup(<Karussell ueberschrift="" folien={[folie("Solidarität")]} />);
    expect(ohne).not.toContain("<img");
  });

  it("names the region after its heading, and falls back to a generic name", () => {
    const mit = renderToStaticMarkup(
      <Karussell ueberschrift="Unsere Werte" folien={[folie("Solidarität")]} />,
    );
    expect(mit).toContain("aria-labelledby");
    expect(mit).toContain("Unsere Werte");
    expect(mit).not.toContain('aria-label="Karussell"');

    const ohne = renderToStaticMarkup(<Karussell ueberschrift="" folien={[folie("Solidarität")]} />);
    expect(ohne).toContain('aria-label="Karussell"');
    expect(ohne).not.toContain("aria-labelledby");
  });

  it("numbers the slides for assistive tech", () => {
    const out = renderToStaticMarkup(
      <Karussell ueberschrift="" folien={[folie("Eins"), folie("Zwei")]} />,
    );
    expect(out).toContain('aria-label="Folie 1 von 2"');
    expect(out).toContain('aria-label="Folie 2 von 2"');
  });

  it("renders nothing at all without slides", () => {
    expect(renderToStaticMarkup(<Karussell ueberschrift="" folien={[]} />)).toBe("");
  });

  it("survives a document saved without the array", () => {
    expect(
      renderToStaticMarkup(<Karussell ueberschrift={undefined as never} folien={undefined as never} />),
    ).toBe("");
  });
});

describe("Karussell, alive in a DOM", () => {
  let host: HTMLDivElement;
  let root: Root;

  const mount = (folien: Folie[], ueberschrift = "") => {
    act(() => {
      root.render(<Karussell ueberschrift={ueberschrift} folien={folien} />);
    });
  };
  const rail = () => host.querySelector("ul") as HTMLUListElement;
  const buttons = (label: string) =>
    [...host.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label") === label);

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("grows its controls once it is alive", () => {
    mount([folie("Eins"), folie("Zwei"), folie("Drei")]);
    expect(buttons("Vorherige Folie")).toHaveLength(1);
    expect(buttons("Nächste Folie")).toHaveLength(1);
    // One dot per slide.
    expect(host.querySelectorAll("[data-karussell-punkt]")).toHaveLength(3);
  });

  it("offers no controls for a single slide", () => {
    // One slide is not a carousel; arrows and a lone dot would be furniture.
    mount([folie("Allein")]);
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });

  it("disables the arrow that would leave the rail", () => {
    mount([folie("Eins"), folie("Zwei")]);
    expect(buttons("Vorherige Folie")[0]?.disabled).toBe(true);
    expect(buttons("Nächste Folie")[0]?.disabled).toBe(false);
  });

  it("moves the rail, not the page, when an arrow is pressed", () => {
    mount([folie("Eins"), folie("Zwei")]);
    const el = rail();
    // happy-dom has no layout: clientWidth is 0 and scrollBy is inert. Both
    // are stood in for, because what this asserts is the call, not the scroll.
    Object.defineProperty(el, "clientWidth", { value: 400, configurable: true });
    const scrollBy = vi.fn();
    el.scrollBy = scrollBy as never;

    act(() => {
      buttons("Nächste Folie")[0]?.click();
    });
    expect(scrollBy).toHaveBeenCalledWith({ left: 400, behavior: "smooth" });
  });

  it("jumps to the slide a dot names", () => {
    mount([folie("Eins"), folie("Zwei"), folie("Drei")]);
    const el = rail();
    Object.defineProperty(el, "clientWidth", { value: 400, configurable: true });
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo as never;

    const punkte = [...host.querySelectorAll("[data-karussell-punkt]")] as HTMLButtonElement[];
    act(() => punkte[2]?.click());
    expect(scrollTo).toHaveBeenCalledWith({ left: 800, behavior: "smooth" });
  });

  it("marks the dot of the slide the rail is actually showing", () => {
    mount([folie("Eins"), folie("Zwei"), folie("Drei")]);
    const el = rail();
    Object.defineProperty(el, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(el, "scrollLeft", { value: 800, configurable: true, writable: true });

    act(() => el.dispatchEvent(new Event("scroll")));

    const punkte = [...host.querySelectorAll("[data-karussell-punkt]")];
    expect(punkte[2]?.getAttribute("aria-current")).toBe("true");
    expect(punkte[0]?.getAttribute("aria-current")).toBeNull();
    expect(buttons("Nächste Folie")[0]?.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `pnpm vitest run apps/web/app/_content/Karussell.test.tsx`
Expected: FAIL — `Karussell is not exported` bzw. `Karussell is not a function`. Die fünf Regel-Tests aus Task 2 bleiben grün.

- [ ] **Step 3: Die Komponente schreiben**

In `apps/web/app/_content/Karussell.tsx` unter `aktiveFolie` ergänzen:

```tsx
/**
 * A rail of slides the reader clicks through — "Werte", "Persönlichkeiten".
 *
 * The rail is a CSS scroll container with snap points, so swipe, momentum and
 * the arrow keys come from the browser and cost nothing. Arrows and dots are
 * the only parts that need JavaScript, and they render only once the component
 * is alive: a control that does nothing is worse than no control, while the
 * rail underneath stays readable and scrollable without any script at all.
 *
 * One slide fills the view. That is the whole difference to `KartenRaster`,
 * which puts its cards side by side — here one thing at a time is the point,
 * which is why there is no "slides per view" field to get wrong.
 *
 * The image is decoration (`alt=""`): the title beside it carries the meaning.
 * A heading, when the board gives one, names the region for assistive tech; a
 * plain paragraph rather than a heading element, exactly as `Panel` does it,
 * because headings on a content page come from the `Ueberschrift` block.
 *
 * Purely presentational and free of Puck types — the block wrapper in
 * `puck-config.tsx` owns the editor placeholder.
 */
export function Karussell({ ueberschrift, folien }: { ueberschrift: string; folien: Folie[] }) {
  const liste = folien ?? [];
  const schiene = React.useRef<HTMLUListElement>(null);
  const [aktiv, setAktiv] = React.useState(0);
  const [lebendig, setLebendig] = React.useState(false);
  const titelId = React.useId();

  React.useEffect(() => setLebendig(true), []);

  if (liste.length === 0) return null;

  const bedienbar = lebendig && liste.length > 1;
  const gehZu = (index: number) => {
    const el = schiene.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  };
  const schiebe = (richtung: -1 | 1) => {
    const el = schiene.current;
    if (!el) return;
    el.scrollBy({ left: richtung * el.clientWidth, behavior: "smooth" });
  };
  const beimScrollen = () => {
    const el = schiene.current;
    if (!el) return;
    setAktiv(aktiveFolie(el.scrollLeft, el.clientWidth, liste.length));
  };

  // The card recipe's hover, on a round button — `Card.tsx` spells the same
  // four classes out, and `recipes.carousel` says the arrows follow it.
  const pfeil =
    "rounded-bdas-full border border-bdas-soft bg-bdas-surface p-2 text-bdas-ink " +
    "shadow-bdas-card transition duration-bdas-soft ease-bdas " +
    "hover:shadow-bdas-lift-md hover:-translate-y-bdas-lift-sm " +
    "disabled:pointer-events-none disabled:opacity-40";

  return (
    <section
      aria-roledescription="Karussell"
      {...(ueberschrift ? { "aria-labelledby": titelId } : { "aria-label": "Karussell" })}
      className="flex flex-col gap-4"
    >
      {ueberschrift ? (
        <p id={titelId} className="font-semibold text-bdas-ink">
          {ueberschrift}
        </p>
      ) : null}

      <ul
        ref={schiene}
        tabIndex={0}
        onScroll={beimScrollen}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto"
      >
        {liste.map((f, i) => (
          <li
            key={i}
            aria-label={`Folie ${i + 1} von ${liste.length}`}
            className="w-full shrink-0 snap-center sm:flex sm:items-center sm:gap-6"
          >
            {f.bild ? (
              <img
                src={f.bild}
                alt=""
                aria-hidden
                className="mb-4 aspect-video w-full rounded-bdas object-cover sm:mb-0 sm:w-1/2"
              />
            ) : null}
            {f.titel || f.text ? (
              <div className="flex flex-col gap-2 sm:flex-1">
                {f.titel ? <p className="font-semibold text-bdas-ink">{f.titel}</p> : null}
                {f.text ? (
                  <p className="whitespace-pre-line text-bdas-ink-body">{f.text}</p>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {bedienbar ? (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Vorherige Folie"
            disabled={aktiv === 0}
            onClick={() => schiebe(-1)}
            className={pfeil}
          >
            ‹
          </button>
          <div className="flex items-center gap-2">
            {liste.map((_, i) => (
              <button
                key={i}
                type="button"
                data-karussell-punkt
                aria-label={`Folie ${i + 1} von ${liste.length}`}
                {...(i === aktiv ? { "aria-current": "true" } : {})}
                onClick={() => gehZu(i)}
                className={`h-2.5 w-2.5 rounded-bdas-full transition-colors duration-bdas-quick ${
                  i === aktiv ? "bg-bdas-red" : "bg-bdas-ink-muted"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Nächste Folie"
            disabled={aktiv === liste.length - 1}
            onClick={() => schiebe(1)}
            className={pfeil}
          >
            ›
          </button>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Die Tailwind-Klassennamen gegen das Preset prüfen**

Jede oben benutzte `bdas-`Klasse stammt aus `core/design-system/src/tailwind-preset.ts` und wurde beim Schreiben dieses Plans dort nachgeschlagen: `rounded-bdas`, `rounded-bdas-full`, `border-bdas-soft`, `bg-bdas-surface`, `bg-bdas-red`, `bg-bdas-ink-muted`, `text-bdas-ink`, `text-bdas-ink-body`, `shadow-bdas-card`, `shadow-bdas-lift-md`, `-translate-y-bdas-lift-sm`, `duration-bdas-soft`, `duration-bdas-quick`, `ease-bdas`.

Run: `grep -nE '"?bdas(-[a-z-]+)?"?:' core/design-system/src/tailwind-preset.ts`
Expected: die Liste bestätigt sich. **Fehlt wider Erwarten eine, ist der Ersatz aus dem Preset zu nehmen — kein neuer Wert, keine Roh-Angabe** (CLAUDE.md §7). Fehlt der Wert wirklich, hier abbrechen und melden statt improvisieren.

- [ ] **Step 5: Tests laufen lassen, grün bestätigen**

Run: `pnpm vitest run apps/web/app/_content/Karussell.test.tsx`
Expected: PASS, alle Tests aus Task 2 und Task 3.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_content/Karussell.tsx apps/web/app/_content/Karussell.test.tsx
git commit -m "$(cat <<'EOF'
feat(content): Karussell block component

Die Schiene ist ein CSS-Scroll-Container mit Snap-Punkten: Wischen, Schwung und
Pfeiltasten kommen vom Browser und kosten kein Kilobyte. JavaScript braucht nur,
was darüber liegt — Pfeile und Punkte —, und genau das rendert erst nach dem
Mount. Ohne Skript bleibt die Schiene lesbar und von Hand scrollbar; tote Knöpfe
wären schlechter als keine.

Eine Folie füllt das Sichtfeld. Das ist der ganze Unterschied zu KartenRaster,
das seine Karten nebeneinanderstellt — deshalb gibt es hier auch kein Feld für
die Anzahl nebeneinander, das man falsch stellen könnte.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Der Block im Puck-Katalog

**Files:**
- Modify: `apps/web/app/_content/puck-config.tsx`
- Modify: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**
- Consumes: `Karussell`, `Folie` aus Task 3; `FotoField`, `BlockPlatzhalter` (bestehend)
- Produces: `puckConfig.components.Karussell` mit `defaultProps: { ueberschrift: "", folien: [] }`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An `apps/web/app/_content/puck-config.test.ts` anhängen, **innerhalb** des äußersten `describe`-Blocks (also vor der letzten schließenden `});`), im Stil des `CtaBanner`-Blocks direkt darüber:

```tsx
  describe("Karussell block", () => {
    const render = (props: Record<string, unknown>) => {
      const r = puckConfig.components.Karussell?.render;
      if (!r) throw new Error("Karussell render missing");
      return renderToStaticMarkup(r(props as never) as never);
    };

    it("starts empty and headingless", () => {
      const defaults = puckConfig.components.Karussell?.defaultProps;
      expect(defaults?.ueberschrift).toBe("");
      expect(defaults?.folien).toEqual([]);
    });

    it("is a placeholder in the editor and nothing at all on the page when empty", () => {
      const leer = { ueberschrift: "", folien: [] };
      expect(render({ ...leer, puck: { isEditing: true } })).toContain("data-block-platzhalter");
      expect(render({ ...leer, puck: { isEditing: false } })).toBe("");
    });

    it("renders the slides it was given", () => {
      const out = render({
        ueberschrift: "Unsere Werte",
        folien: [
          { bild: "", titel: "Solidarität", text: "Wir stehen füreinander ein." },
          { bild: "", titel: "Vielfalt", text: "Wir sind viele." },
        ],
        puck: { isEditing: false },
      });
      expect(out).toContain("Unsere Werte");
      expect(out).toContain("Solidarität");
      expect(out).toContain("Vielfalt");
      expect(out).toContain("snap-x");
    });

    it("renders a document saved before the heading field existed", () => {
      // Every page saved by PR1–PR4 carries slides without an `ueberschrift`.
      const out = render({
        folien: [{ bild: "", titel: "Solidarität", text: "" }],
        puck: { isEditing: false },
      });
      expect(out).toContain("Solidarität");
      expect(out).toContain('aria-label="Karussell"');
    });

    it("summarises a slide by its title in the editor's list", () => {
      const feld = puckConfig.components.Karussell?.fields?.folien;
      const summary =
        feld && "getItemSummary" in feld
          ? (feld.getItemSummary as (f: { titel: string }) => string)
          : undefined;
      expect(summary?.({ titel: "Solidarität" })).toBe("Solidarität");
      expect(summary?.({ titel: "" })).toBe("Neue Folie");
    });
  });
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm vitest run apps/web/app/_content/puck-config.test.ts -t "Karussell block"`
Expected: FAIL — `Karussell render missing`.

- [ ] **Step 3: Den Block registrieren**

Drei Änderungen in `apps/web/app/_content/puck-config.tsx`:

**a) Import**, zu den anderen `_content`-Importen (alphabetisch bei `KartenRaster`):

```tsx
import { type Folie, Karussell } from "./Karussell";
```

**b) Typ**, im `Blocks`-Objekt nach `KartenRaster`:

```tsx
  Karussell: { ueberschrift: string; folien: Folie[] };
```

**c) Registrierung**, in `puckConfig.components` nach dem `Kennzahlen`-Block:

```tsx
    Karussell: {
      label: "Karussell",
      fields: {
        ueberschrift: { type: "text", label: "Überschrift (optional)" },
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
      defaultProps: { ueberschrift: "", folien: [] },
      render: ({ ueberschrift, folien, puck }) =>
        (folien ?? []).length === 0 && puck?.isEditing ? (
          <BlockPlatzhalter titel="Karussell" hinweis="Noch keine Folien hinzugefügt." />
        ) : (
          <Karussell ueberschrift={ueberschrift} folien={folien} />
        ),
    },
```

- [ ] **Step 4: Tests laufen lassen, grün bestätigen**

Run: `pnpm vitest run apps/web/app/_content/puck-config.test.ts`
Expected: PASS — die neuen Tests **und** die gesamte bestehende Datei.

- [ ] **Step 5: Die ganze Suite und die Werkzeuge**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: alles grün.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "$(cat <<'EOF'
feat(content): register the Karussell block

Felder wie beim Karten-Raster — Array aus Bild, Titel, Text —, dazu eine
optionale Überschrift. Die trägt doppelt: sichtbar über der Schiene und als
Name der Region für Screenreader. Bleibt sie leer, heißt die Region schlicht
„Karussell"; ein fester Text wäre für alle anderen Fälle der schlechtere Name.

Leer und im Editor: Platzhalter. Leer auf der Seite: nichts.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: ADR 0039 und Gesamtabnahme

**Files:**
- Create: `docs/decisions/0039-karussell-ohne-neue-abhaengigkeit.md`

**Interfaces:**
- Consumes: alles davor
- Produces: nichts, was Code liest

- [ ] **Step 1: Die ADR schreiben**

`docs/decisions/0039-karussell-ohne-neue-abhaengigkeit.md`:

```markdown
# ADR 0039 — Karussell ohne neue Abhängigkeit

- **Status:** Angenommen
- **Datum:** 2026-09-09
- **Betrifft:** `apps/web/app/_content`, `core/design-system`
- **Verhältnis zur Spec:** weicht von §7 und §8 der Design-Spec
  `2026-09-08-content-pages-layout-erweiterung-design.md` ab; ADR 0036 bleibt
  im Übrigen unberührt.

## Kontext

§8 der Spec sah für den Karussell-Block `embla-carousel-react` vor, bezogen
über `pnpm dlx shadcn@latest add carousel`. Beim Umsetzen zeigte sich: Dieser
Weg existiert im Repo nicht. Es gibt keine `components.json` und keine
shadcn-Installation; die Primitives in `core/design-system/src/components/`
(Dialog, Combobox, PasswordInput) sind von Hand im shadcn-Stil geschrieben.
Die CLI hätte ein zweites Komponenten-Zuhause neben `core/design-system`
aufgemacht und Dubletten bestehender Primitives mitgebracht.

Damit stand die Abhängigkeit selbst zur Frage. Zwei Dinge fielen dabei auf:
Tastatur-Navigation bringt embla **nicht** von Haus aus mit — das ist ein
Keydown-Handler in shadcns Wrapper, den wir so oder so selbst geschrieben
hätten; §8 hatte das zu Recht als offene Frage markiert. Und die Anforderung
aus §6 ist bescheiden: kein Autoplay, kein Loop, eine Folie pro Sichtfeld.

## Entscheidung

Das Karussell entsteht aus CSS: ein horizontaler Scroll-Container mit
`snap-x snap-mandatory`, eine Folie pro Sichtfeld. Wischen, Schwung und
Pfeiltasten liefert der Browser. Pfeil-Buttons rufen `scrollBy`, Punkte
`scrollTo`; welche Folie aktiv ist, entscheidet eine reine Funktion über
`scrollLeft` und Schienenbreite.

Keine neue Laufzeit-Abhängigkeit. Damit ist die Block-Erweiterung aus ADR 0036
vollständig, ohne dass das Projekt eine einzige Bibliothek dazugewonnen hat.

Zwei kleinere Abweichungen von §7 gehören dazu:

- Die Navigationspunkte tragen `radii.full`, nicht den Pill-Radius. Die
  Token-Skala reserviert `full` ausdrücklich für „genuinely circular elements
  — nav buttons, markers, dots".
- Das Rezept nennt für den Folienwechsel keine Dauer. Ein nativer Smooth-Scroll
  nimmt keine an; die Dauer gehört dem Browser. Eine Zahl, die nichts steuert,
  wäre falsche Präzision.

## Konsequenzen

**Dafür:** Kein Bundle-Zuwachs, keine Abhängigkeit, die gepflegt und aktualisiert
werden will. Alle Folien stehen im DOM, ohne `aria-hidden`-Turnübungen — der
Block liest sich für Screenreader als das, was er ist, eine Liste. Ohne
JavaScript bleibt er vollständig lesbar und von Hand scrollbar.

**Dagegen:** Kein Endlos-Loop und keine Feinsteuerung der Wechsel-Animation.
Beides verlangt §6 ausdrücklich nicht. Sollte später ein Karussell mit Loop
oder Autoplay gebraucht werden, ist das eine neue Entscheidung — und dann
spricht nichts gegen embla.

**Offen:** Ein Karussell mit mehreren Folien nebeneinander gibt es bewusst nicht;
dafür ist `KartenRaster` da. Die Abgrenzung lebt in den Block-Labels, nicht im
Code.
```

- [ ] **Step 2: Die Serie gegen die Spec durchgehen**

Run: `grep -n 'Karussell' docs/superpowers/specs/2026-09-08-content-pages-layout-erweiterung-design.md`
Expected: Jede Zusage aus §6, §7 und §11 ist entweder umgesetzt oder in der ADR als Abweichung begründet. Konkret zu prüfen: kein Autoplay im DOM oder Snapshot (§11), Pfeile **und** Punkte vorhanden (§6), Rezept im Design-System (§7).

- [ ] **Step 3: Volle Abnahme**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm --filter @bdas/web build`
Expected: alles grün. Der Build ist hier kein Ritual: `Karussell.tsx` ist der erste `"use client"`-Block, der öffentlich gerendert wird — wenn die Grenze falsch liegt, fällt es hier auf und nirgends sonst.

- [ ] **Step 4: Commit**

```bash
git add docs/decisions/0039-karussell-ohne-neue-abhaengigkeit.md
git commit -m "$(cat <<'EOF'
docs: ADR 0039 — Karussell ohne neue Abhängigkeit

Hält fest, warum die in Spec §8 vorgesehene Abhängigkeit nicht kam: Der
shadcn-CLI-Weg existiert im Repo nicht, und embla hätte die Tastatur-Navigation
ohnehin nicht mitgebracht. Dazu die zwei bewussten Abweichungen vom Rezept
in §7.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Nach dem Plan: von Hand anzusehen

Diese Punkte kann kein Test hier abnehmen. Sie gehören in die PR-Beschreibung als das, was noch offen ist:

1. **Der Block im laufenden Editor** — braucht einen Vorstands-Login. Zu prüfen: Stört die Snap-Schiene das Ziehen und Ablegen im Puck-Canvas? Der Vorschau-Umschalter aus PR1 ist der schnellste Weg, das zu vergleichen.
2. **Die native Scrollleiste** unter der Schiene bleibt bewusst sichtbar — sie ist eine Bedien-Andeutung und kostet keine Zeile. Ob sie unter den Punkten stört, entscheidet das Auge, nicht der Test.
3. **Tastatur-Durchlauf** in einem echten Browser: Tab auf die Schiene, Pfeiltasten, dann Tab auf Pfeile und Punkte.

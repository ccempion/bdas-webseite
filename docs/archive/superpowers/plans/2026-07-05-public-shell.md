# Public Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New public face for bdas.de — navigation with dropdowns, rebuilt landing page (hero, groups, news, Schedule-X event calendar, AGs, Connect), static Über-uns/Unsere-Arbeit pages, SEO — all behind `BDAS_FLAG_PUBLIC_SHELL`.

**Architecture:** All app-layer work in `apps/web` (no new module, no new tables). New `_public/` component folder mirrors the existing `_events`/`_groups` convention. Landing is a Server Component calling only public module interfaces (`listGroups`, `listUpcomingEvents`, `NewsSource`); the Schedule-X calendar is the only client island. Flag off ⇒ today's shell renders unchanged.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind via `@bdas/design-system` preset, Schedule-X (calendar), Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-07-05-public-shell-design.md`

## Global Constraints

- All copy is **German**. Placeholder copy is fine but must be real German sentences, not lorem ipsum.
- **Design tokens only** — never inline a hex, radius, shadow, or duration. Tailwind classes come from the `bdas-*` preset (`rounded-bdas`, `rounded-bdas-pill`, `text-bdas-ink`, `text-bdas-ink-body`, `text-bdas-ink-muted`, `bg-bdas-surface`, `border-bdas-soft`, `shadow-bdas-card`, `duration-bdas-quick`, `ease-bdas`, `bg-bdas-overlay-hover`, `text-bdas-red`, `bg-bdas-red`). If a value is missing, add it to `core/design-system/src/tokens.ts` + `tailwind-preset.ts` first.
- **Rule 1 (CLAUDE.md §1):** the app layer never touches module tables — only public interfaces `@bdas/groups`, `@bdas/events-module`, `@bdas/members`, `@bdas/auth`.
- Brand red `#d12020` (`bg-bdas-red`/`text-bdas-red`) only for accents/CTAs, never default text.
- Unit tests live under `apps/web/app/**` (the package test script is `vitest run --dir app`). Run with `pnpm -C apps/web test`. E2E: `pnpm e2e <file>`.
- Root scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test` must stay green after every task.
- Commits: conventional style, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- The existing `SiteHeader`/`SiteFooter`/`HomePage` must render **byte-identical** when `BDAS_FLAG_PUBLIC_SHELL` is off.

---

### Task 1: ADR 0018 + feature flags `public_shell` and `blog`

**Files:**

- Create: `docs/decisions/0018-public-web-presence-in-platform.md`
- Modify: `core/feature-flags/src/index.ts` (FLAGS array)
- Modify: `.env.example` (flags block)

**Interfaces:**

- Produces: `isFlagOn("public_shell")` and `isFlagOn("blog")` — every later task gates on the former; the header (Task 3) checks the latter for the Blog nav item.

- [ ] **Step 1: Write the ADR**

```markdown
# 0018 — Public web presence lives in the platform

**Status:** Accepted 2026-07-05
**Supersedes:** the spec §3 non-goal "public marketing/blog website out of scope"

## Context

The platform (dashboard.bdas.de) and the federation's public site (WordPress at
bdas.de) were separate products. The session cookie is host-only (ADR 0003), so
public pages on a different host can never see the login. The product vision is
progressive disclosure: the same public pages reveal more to logged-in users by
role (blog visibility tiers, members-only events in the public calendar, member
details on group pages — issues #50, #24).

## Decision

1. **One host.** Public pages and the logged-in platform both live on
   **bdas.de** in `apps/web`. WordPress is fully retired (DNS cutover; hosting
   cancelled after MX/email is confirmed independent — issue #32).
2. **Public shell** (navigation, landing, static pages, SEO) ships behind
   `BDAS_FLAG_PUBLIC_SHELL`; flipping it on is the go-live, coordinated with
   the DNS cutover.
3. **New dependency:** Schedule-X (MIT) renders the landing-page event
   calendar. Chosen over FullCalendar for bundle size and CSS-variable
   theming that consumes our design tokens.
4. A `blog` feature flag is reserved now so the navigation can reference the
   future blog module (issue #50) without dead links.

## Consequences

- The spec's §3 non-goal is reversed; the platform is the federation's entire
  web presence.
- All sessions invalidate once at the domain move (host-only cookie).
- Legacy WordPress URLs get a redirect map in the app so indexed links keep
  resolving.
```

- [ ] **Step 2: Add the flags**

In `core/feature-flags/src/index.ts`, extend the FLAGS array (keep alphabetical-ish grouping as-is, append at the end):

```ts
export const FLAGS = [
  "auth",
  "members",
  "groups",
  "events",
  "files",
  "notifications",
  "projects",
  "handover",
  "payments",
  "dashboard",
  "blog",
  "public_shell",
] as const;
```

- [ ] **Step 3: Document the env vars**

In `.env.example`, append to the flags block:

```
BDAS_FLAG_BLOG=false
BDAS_FLAG_PUBLIC_SHELL=false
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: PASS (flag machinery has existing tests; new names are just array members)

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/0018-public-web-presence-in-platform.md core/feature-flags/src/index.ts .env.example
git commit -m "feat(flags): public_shell + blog flags, ADR 0018 public web presence"
```

---

### Task 2: Design-system additions — hero overlay token, `Section`, `FilterChip`

**Files:**

- Modify: `core/design-system/src/tokens.ts` (add `colors.surface.overlay.heroScrim`)
- Modify: `core/design-system/src/tailwind-preset.ts` (map `bdas-hero-scrim` backgroundImage)
- Create: `core/design-system/src/components/Section.tsx`
- Create: `core/design-system/src/components/FilterChip.tsx`
- Modify: `core/design-system/src/index.ts` (re-exports)

**Interfaces:**

- Produces: `<Section id?, title, intro?, children>` — landing block wrapper (`<section>` + heading). `<FilterChip active, onClick, children>` — pill toggle button (client-safe, plain props). Tailwind class `bg-bdas-hero-scrim`.

- [ ] **Step 1: Add the scrim token**

In `tokens.ts`, inside `colors.surface.overlay`, add:

```ts
      /** Dark gradient laid over hero imagery so white text stays readable. */
      heroScrim: "linear-gradient(rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.55))",
```

In `tailwind-preset.ts`, add to the theme extension (next to the existing keyframes/animation entries):

```ts
      backgroundImage: {
        "bdas-hero-scrim": colors.surface.overlay.heroScrim,
      },
```

- [ ] **Step 2: Create `Section`**

`core/design-system/src/components/Section.tsx`:

```tsx
import type { ReactNode } from "react";

import { cx } from "../cx";

export type SectionProps = {
  id?: string;
  title: string;
  intro?: string;
  /** Right-aligned header action, e.g. a "see all" link. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** Landing/content page block: consistent width, heading, optional intro. */
export function Section({ id, title, intro, action, className, children }: SectionProps) {
  return (
    <section id={id} className={cx("mx-auto w-full max-w-6xl px-4 py-12", className)}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold text-bdas-ink">{title}</h2>
          {intro ? <p className="text-bdas-ink-body">{intro}</p> : null}
        </div>
        {action ?? null}
      </header>
      {children}
    </section>
  );
}
```

- [ ] **Step 3: Create `FilterChip`**

`core/design-system/src/components/FilterChip.tsx`:

```tsx
import type { ReactNode } from "react";

import { cx } from "../cx";

export type FilterChipProps = {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
};

/** Toggleable pill for inline filtering (calendar, lists). */
export function FilterChip({ active, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex items-center rounded-bdas-pill border px-3 py-1 text-bdas-pill transition-colors duration-bdas-quick ease-bdas",
        active
          ? "border-bdas-strong bg-bdas-red text-white"
          : "border-bdas-soft bg-bdas-surface text-bdas-ink hover:bg-bdas-overlay-hover",
      )}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Re-export**

In `core/design-system/src/index.ts` append:

```ts
export { Section, type SectionProps } from "./components/Section";
export { FilterChip, type FilterChipProps } from "./components/FilterChip";
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

```bash
git add core/design-system/src
git commit -m "feat(design-system): hero scrim token, Section + FilterChip primitives"
```

---

### Task 3: Public header (three role states, dropdown, mobile)

**Files:**

- Create: `apps/web/app/_public/PublicHeader.tsx`
- Create: `apps/web/app/_public/nav-items.ts`
- Modify: `apps/web/app/layout.tsx` (flag-gated swap)

**Interfaces:**

- Consumes: `loadCurrentMember` from `apps/web/app/_dashboard/session.ts`; `canAdministerBoard` from `@bdas/dashboard-shell`; `isFlagOn` from `@bdas/feature-flags`.
- Produces: `<PublicHeader />` (async Server Component, no props). `navItems(): NavItem[]` in `nav-items.ts` (flag-aware, computed per request).

- [ ] **Step 1: Create the nav data**

`apps/web/app/_public/nav-items.ts`:

```ts
import { isFlagOn } from "@bdas/feature-flags";

export type NavLeaf = { label: string; href: string };
export type NavItem = NavLeaf | { label: string; children: NavLeaf[] };

/** Top navigation. Computed per-request so flags apply. */
export function navItems(): NavItem[] {
  const items: NavItem[] = [
    {
      label: "Über uns",
      children: [
        { label: "Kurzportrait", href: "/ueber-uns" },
        { label: "Verbandsstruktur", href: "/ueber-uns/verbandsstruktur" },
        { label: "Bund der Alevitischen Jugendlichen (BDAJ)", href: "/ueber-uns/bdaj" },
      ],
    },
    { label: "Unsere Arbeit", href: "/unsere-arbeit" },
  ];
  if (isFlagOn("events")) items.push({ label: "Events", href: "/events" });
  if (isFlagOn("blog")) items.push({ label: "Blog", href: "/blog" });
  if (isFlagOn("groups")) items.push({ label: "Gruppen", href: "/gruppen" });
  return items;
}
```

- [ ] **Step 2: Create the header**

`apps/web/app/_public/PublicHeader.tsx`. Uses `<details>` for the Über-uns dropdown, the account menu, and the mobile menu — the repo's canonical disclosure idiom, zero client JS:

```tsx
import Link from "next/link";

import { canAdministerBoard } from "@bdas/dashboard-shell";

import { loadCurrentMember } from "../_dashboard/session";
import { navItems, type NavItem } from "./nav-items";

const PILL =
  "inline-flex items-center rounded-bdas-pill px-3 py-1.5 text-bdas-pill text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-overlay-hover";
const DROPDOWN_LINK =
  "block rounded-bdas-sm px-3 py-2 text-bdas-dropdown-link text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-hover";

function DesktopItem({ item }: { item: NavItem }) {
  if ("href" in item) {
    return (
      <Link href={item.href} className={PILL}>
        {item.label}
      </Link>
    );
  }
  return (
    <details className="group relative">
      <summary className={`${PILL} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        {item.label}
        <span
          aria-hidden
          className="ml-1 text-bdas-ink-muted transition-transform duration-bdas-quick group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <ul className="absolute left-0 top-full z-40 mt-2 w-72 animate-bdas-fade-slide-down rounded-bdas border border-bdas-strong bg-bdas-surface p-2 shadow-bdas-dropdown">
        {item.children.map((c) => (
          <li key={c.href}>
            <Link href={c.href} className={DROPDOWN_LINK}>
              {c.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export async function PublicHeader() {
  const items = navItems();
  const me = await loadCurrentMember();
  const isBoard = me ? canAdministerBoard(me.grants) : false;
  const displayName = me?.member?.firstName ?? "Konto";

  return (
    <header className="sticky top-0 z-50 border-b border-bdas-soft bg-bdas-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-bdas-ink hover:text-bdas-red"
        >
          BDAS
        </Link>

        {/* Desktop nav */}
        <nav
          aria-label="Hauptnavigation"
          className="hidden flex-1 items-center justify-end md:flex"
        >
          <ul className="flex items-center gap-1">
            {items.map((item) => (
              <li key={item.label}>
                <DesktopItem item={item} />
              </li>
            ))}
            {me ? (
              <li>
                <details className="group relative">
                  <summary
                    className={`${PILL} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
                  >
                    {displayName}
                    <span
                      aria-hidden
                      className="ml-1 text-bdas-ink-muted transition-transform duration-bdas-quick group-open:rotate-180"
                    >
                      ▾
                    </span>
                  </summary>
                  <ul className="absolute right-0 top-full z-40 mt-2 w-56 animate-bdas-fade-slide-down rounded-bdas border border-bdas-strong bg-bdas-surface p-2 shadow-bdas-dropdown">
                    <li>
                      <Link href="/account" className={DROPDOWN_LINK}>
                        Mein Konto
                      </Link>
                    </li>
                    {isBoard ? (
                      <li>
                        <Link href="/dashboard" className={DROPDOWN_LINK}>
                          Board-Bereich
                        </Link>
                      </li>
                    ) : null}
                    <li>
                      <form action="/abmelden" method="post">
                        <button type="submit" className={`${DROPDOWN_LINK} w-full text-left`}>
                          Abmelden
                        </button>
                      </form>
                    </li>
                  </ul>
                </details>
              </li>
            ) : (
              <>
                <li>
                  <Link
                    href="/registrieren"
                    className="inline-flex items-center rounded-bdas-pill bg-bdas-red px-4 py-1.5 text-bdas-pill font-medium text-white transition-colors duration-bdas-quick ease-bdas hover:brightness-110"
                  >
                    Mitglied werden
                  </Link>
                </li>
                <li>
                  <Link href="/anmelden" className={PILL}>
                    Anmelden
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>

        {/* Mobile menu */}
        <details className="ml-auto md:hidden">
          <summary
            aria-label="Menü öffnen"
            className="cursor-pointer list-none rounded-bdas border border-bdas-strong px-3 py-1.5 text-bdas-ink [&::-webkit-details-marker]:hidden"
          >
            Menü
          </summary>
          <nav
            aria-label="Hauptnavigation mobil"
            className="absolute inset-x-0 top-full z-40 border-b border-bdas-soft bg-bdas-surface px-4 py-4 shadow-bdas-dropdown"
          >
            <ul className="flex flex-col gap-1">
              {items.map((item) =>
                "href" in item ? (
                  <li key={item.label}>
                    <Link href={item.href} className={DROPDOWN_LINK}>
                      {item.label}
                    </Link>
                  </li>
                ) : (
                  <li key={item.label}>
                    <details>
                      <summary
                        className={`${DROPDOWN_LINK} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
                      >
                        {item.label}
                      </summary>
                      <ul className="ml-3 flex flex-col gap-1 rounded-bdas bg-bdas-overlay-faint p-2">
                        {item.children.map((c) => (
                          <li key={c.href}>
                            <Link href={c.href} className={DROPDOWN_LINK}>
                              {c.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ),
              )}
              {me ? (
                <>
                  <li>
                    <Link href="/account" className={DROPDOWN_LINK}>
                      Mein Konto
                    </Link>
                  </li>
                  {isBoard ? (
                    <li>
                      <Link href="/dashboard" className={DROPDOWN_LINK}>
                        Board-Bereich
                      </Link>
                    </li>
                  ) : null}
                  <li>
                    <form action="/abmelden" method="post">
                      <button type="submit" className={`${DROPDOWN_LINK} w-full text-left`}>
                        Abmelden
                      </button>
                    </form>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link
                      href="/registrieren"
                      className="mt-2 inline-flex items-center rounded-bdas-pill bg-bdas-red px-4 py-2 font-medium text-white"
                    >
                      Mitglied werden
                    </Link>
                  </li>
                  <li>
                    <Link href="/anmelden" className={DROPDOWN_LINK}>
                      Anmelden
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Swap by flag in the root layout**

In `apps/web/app/layout.tsx`, add imports and replace `<SiteHeader />`:

```tsx
import { isFlagOn } from "@bdas/feature-flags";

import { PublicHeader } from "./_public/PublicHeader";
```

```tsx
{
  isFlagOn("public_shell") ? <PublicHeader /> : <SiteHeader />;
}
```

- [ ] **Step 4: Verify both states manually**

Run: `pnpm -C apps/web dev` — check `/` with `BDAS_FLAG_PUBLIC_SHELL=false` (old header) and `=true` in `.env.local` (new header: dropdown opens, mobile menu at narrow width, logged-out CTAs).
Then: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_public apps/web/app/layout.tsx
git commit -m "feat(web): public header with role states behind public_shell flag"
```

---

### Task 4: Public footer

**Files:**

- Create: `apps/web/app/_public/PublicFooter.tsx`
- Modify: `apps/web/app/layout.tsx` (flag-gated swap)

**Interfaces:**

- Consumes: `legalUrls()` from `apps/web/lib/legal.ts` (already imported in layout). Footer links are static by design (footer shows a curated set, not the nav).
- Produces: `<PublicFooter privacyUrl, imprintUrl />`.

- [ ] **Step 1: Create the footer**

`apps/web/app/_public/PublicFooter.tsx`:

```tsx
import Link from "next/link";

const LINK = "hover:text-bdas-red hover:underline";

/** Public-site footer: contact, quick links, partner orgs, legal, socials.
 *  Contact details and social handles are placeholders (spec §8 open items). */
export function PublicFooter({
  privacyUrl,
  imprintUrl,
}: {
  privacyUrl: string;
  imprintUrl: string;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-bdas-soft bg-bdas-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-bdas-ink-body sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold text-bdas-ink">Kontakt</h2>
          <p>Bund der Alevitischen Studierenden in Deutschland</p>
          <p>
            <a href="mailto:info@bdas.de" className={LINK}>
              info@bdas.de
            </a>
          </p>
        </div>
        <nav aria-label="Seiten" className="flex flex-col gap-2">
          <h2 className="font-semibold text-bdas-ink">Seiten</h2>
          <Link href="/ueber-uns" className={LINK}>
            Über uns
          </Link>
          <Link href="/unsere-arbeit" className={LINK}>
            Unsere Arbeit
          </Link>
          <Link href="/events" className={LINK}>
            Events
          </Link>
          <Link href="/gruppen" className={LINK}>
            Gruppen
          </Link>
        </nav>
        <nav aria-label="Partner" className="flex flex-col gap-2">
          <h2 className="font-semibold text-bdas-ink">Verbund</h2>
          <a href="https://bdaj.de" rel="noopener noreferrer" target="_blank" className={LINK}>
            BDAJ — Bund der Alevitischen Jugendlichen
          </a>
          <a href="https://alevi.com" rel="noopener noreferrer" target="_blank" className={LINK}>
            AABF — Alevitische Gemeinde Deutschland
          </a>
        </nav>
        <nav aria-label="Rechtliches und Social Media" className="flex flex-col gap-2">
          <h2 className="font-semibold text-bdas-ink">Rechtliches</h2>
          <Link href={privacyUrl} className={LINK}>
            Datenschutz
          </Link>
          <Link href={imprintUrl} className={LINK}>
            Impressum
          </Link>
          <a
            href="https://www.instagram.com/"
            rel="noopener noreferrer"
            target="_blank"
            className={LINK}
          >
            Instagram
          </a>
        </nav>
      </div>
      <div className="border-t border-bdas-soft">
        <p className="mx-auto max-w-6xl px-4 py-4 text-sm text-bdas-ink-muted">
          © {year} Bund der Alevitischen Studierenden
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Swap by flag in the root layout**

```tsx
import { PublicFooter } from "./_public/PublicFooter";
```

```tsx
{
  isFlagOn("public_shell") ? (
    <PublicFooter privacyUrl={privacy} imprintUrl={imprint} />
  ) : (
    <SiteFooter privacyUrl={privacy} imprintUrl={imprint} />
  );
}
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

```bash
git add apps/web/app/_public/PublicFooter.tsx apps/web/app/layout.tsx
git commit -m "feat(web): public footer behind public_shell flag"
```

---

### Task 5: Static pages (Über uns ×3, Unsere Arbeit) + flag helper

**Files:**

- Create: `apps/web/app/_public/flag.ts`
- Create: `apps/web/app/_public/ags.ts`
- Create: `apps/web/app/ueber-uns/page.tsx`
- Create: `apps/web/app/ueber-uns/verbandsstruktur/page.tsx`
- Create: `apps/web/app/ueber-uns/bdaj/page.tsx`
- Create: `apps/web/app/unsere-arbeit/page.tsx`

**Interfaces:**

- Produces: `requirePublicShellFlag()` (throws `notFound()` when flag off — mirrors `apps/web/app/_events/flag.ts`); `AGS: ReadonlyArray<{ slug, name, teaser }>` consumed by the landing (Task 6).

- [ ] **Step 1: Flag helper**

`apps/web/app/_public/flag.ts`:

```ts
import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/** Public-shell routes 404 while the flag is off (CLAUDE.md §3, rule 6). */
export function requirePublicShellFlag(): void {
  if (!isFlagOn("public_shell")) notFound();
}
```

- [ ] **Step 2: AG data**

`apps/web/app/_public/ags.ts`:

```ts
/** The four Arbeitsgruppen. Hardcoded by design (spec §3) — becomes data
 *  only if AGs ever get their own module. Copy = placeholder (spec §8). */
export const AGS = [
  {
    slug: "oeffentlichkeitsarbeit",
    name: "Öffentlichkeitsarbeit & Social Media",
    teaser: "Wir gestalten die Außendarstellung des BDAS — von Instagram bis zur Pressemitteilung.",
  },
  {
    slug: "medizin",
    name: "Medizin",
    teaser: "Vernetzung und Austausch für Studierende der Medizin und Gesundheitsberufe.",
  },
  {
    slug: "ingenieurwesen-technik",
    name: "Ingenieurwesen & Technik",
    teaser: "Von Maschinenbau bis Informatik — Projekte und Kontakte für Technikstudierende.",
  },
  {
    slug: "jura",
    name: "Jura",
    teaser: "Austausch für Jurastudierende — vom Staatsexamen bis zum Berufseinstieg.",
  },
] as const;
```

- [ ] **Step 3: Kurzportrait page**

`apps/web/app/ueber-uns/page.tsx` (this pattern repeats for the other three pages — each page carries its own placeholder copy, `metadata`, and the flag guard):

```tsx
import type { Metadata } from "next";

import { requirePublicShellFlag } from "../_public/flag";

export const metadata: Metadata = {
  title: "Über uns",
  description:
    "Der Bund der Alevitischen Studierenden in Deutschland (BDAS) — wer wir sind und wofür wir stehen.",
};

export default function KurzportraitPage() {
  requirePublicShellFlag();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold text-bdas-ink">Über uns</h1>
      {/* Platzhaltertext — finale Texte liefert der Bundesvorstand (Spec §8). */}
      <p className="text-bdas-ink-body">
        Der Bund der Alevitischen Studierenden in Deutschland (BDAS) ist der Zusammenschluss
        alevitischer Hochschulgruppen an deutschen Universitäten. Wir vernetzen Studierende,
        organisieren Veranstaltungen und vertreten die Interessen alevitischer Studierender.
      </p>
      <p className="text-bdas-ink-body">
        Von der Erstsemester-Begrüßung bis zur Bundeskonferenz: Unsere Hochschulgruppen leben
        alevitische Werte im Studienalltag — offen, demokratisch und solidarisch.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Verbandsstruktur page**

`apps/web/app/ueber-uns/verbandsstruktur/page.tsx`:

```tsx
import type { Metadata } from "next";

import { requirePublicShellFlag } from "../../_public/flag";

export const metadata: Metadata = {
  title: "Verbandsstruktur",
  description: "Wie der BDAS organisiert ist: Hochschulgruppen, Bundesvorstand, Bundeskonferenz.",
};

export default function VerbandsstrukturPage() {
  requirePublicShellFlag();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold text-bdas-ink">Verbandsstruktur</h1>
      {/* Platzhaltertext — finale Texte liefert der Bundesvorstand (Spec §8). */}
      <p className="text-bdas-ink-body">
        Der BDAS besteht aus lokalen Hochschulgruppen, die von gewählten lokalen Vorständen geleitet
        werden. Auf Bundesebene koordiniert der Bundesvorstand die gemeinsame Arbeit; die
        Bundeskonferenz ist das höchste beschlussfassende Gremium.
      </p>
    </main>
  );
}
```

- [ ] **Step 5: BDAJ page**

`apps/web/app/ueber-uns/bdaj/page.tsx`:

```tsx
import type { Metadata } from "next";

import { requirePublicShellFlag } from "../../_public/flag";

export const metadata: Metadata = {
  title: "Bund der Alevitischen Jugendlichen (BDAJ)",
  description: "Unser Jugendverband: der Bund der Alevitischen Jugendlichen in Deutschland e.V.",
};

export default function BdajPage() {
  requirePublicShellFlag();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold text-bdas-ink">
        Bund der Alevitischen Jugendlichen (BDAJ)
      </h1>
      {/* Platzhaltertext — finale Texte liefert der Bundesvorstand (Spec §8). */}
      <p className="text-bdas-ink-body">
        Der BDAJ ist die Jugendorganisation der Alevitischen Gemeinde Deutschland und vertritt über
        78.000 Kinder, Jugendliche und junge Erwachsene. Der BDAS ist eng mit dem BDAJ verbunden —
        viele unserer Mitglieder sind dort groß geworden.
      </p>
      <p>
        <a
          href="https://bdaj.de"
          rel="noopener noreferrer"
          target="_blank"
          className="text-bdas-red hover:underline"
        >
          Zur Website des BDAJ →
        </a>
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Unsere Arbeit page**

`apps/web/app/unsere-arbeit/page.tsx`:

```tsx
import type { Metadata } from "next";

import { Card } from "@bdas/design-system";

import { AGS } from "../_public/ags";
import { requirePublicShellFlag } from "../_public/flag";

export const metadata: Metadata = {
  title: "Unsere Arbeit",
  description: "Die Arbeitsgruppen des BDAS: Öffentlichkeitsarbeit, Medizin, Technik, Jura.",
};

export default function UnsereArbeitPage() {
  requirePublicShellFlag();
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-bdas-ink">Unsere Arbeit</h1>
        <p className="text-bdas-ink-body">
          In Arbeitsgruppen (AGs) organisieren wir uns über Gruppengrenzen hinweg.
        </p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {AGS.map((ag) => (
          <li key={ag.slug}>
            <Card className="h-full p-5">
              <h2 className="mb-2 text-xl font-semibold text-bdas-ink">{ag.name}</h2>
              <p className="text-bdas-ink-body">{ag.teaser}</p>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 7: Verify + commit**

Run: `pnpm typecheck && pnpm lint`. With flag on in `.env.local`, `pnpm -C apps/web dev` → all four pages render; with flag off they 404.
Expected: PASS

```bash
git add apps/web/app/_public apps/web/app/ueber-uns apps/web/app/unsere-arbeit
git commit -m "feat(web): static Über-uns and Unsere-Arbeit pages behind public_shell"
```

---

### Task 6: Styled error pages (404 / 500)

**Files:**

- Create: `apps/web/app/not-found.tsx`
- Create: `apps/web/app/error.tsx`

**Interfaces:** none (Next.js conventions). Not flag-gated — a styled error page is a strict improvement in both shell states.

- [ ] **Step 1: 404 page**

`apps/web/app/not-found.tsx`:

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-start gap-4 px-4 py-24">
      <p className="text-bdas-ink-muted">Fehler 404</p>
      <h1 className="text-3xl font-semibold text-bdas-ink">Seite nicht gefunden</h1>
      <p className="text-bdas-ink-body">
        Die aufgerufene Seite existiert nicht oder wurde verschoben.
      </p>
      <Link href="/" className="text-bdas-red hover:underline">
        Zur Startseite →
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: 500 page**

`apps/web/app/error.tsx` (must be a client component per Next.js):

```tsx
"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-start gap-4 px-4 py-24">
      <p className="text-bdas-ink-muted">Fehler</p>
      <h1 className="text-3xl font-semibold text-bdas-ink">Etwas ist schiefgelaufen</h1>
      <p className="text-bdas-ink-body">Bitte versuche es erneut.</p>
      <button type="button" onClick={reset} className="text-bdas-red hover:underline">
        Erneut versuchen →
      </button>
    </main>
  );
}
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm typecheck && pnpm lint`; visit a bogus URL in dev → styled 404.

```bash
git add apps/web/app/not-found.tsx apps/web/app/error.tsx
git commit -m "feat(web): styled 404 and error pages"
```

---

### Task 7: Landing blocks — Hero (with pause), Gruppen, AGs, Connect

**Files:**

- Create: `apps/web/app/_public/landing/HeroSlideshow.tsx` (client)
- Create: `apps/web/app/_public/landing/Hero.tsx`
- Create: `apps/web/app/_public/landing/GruppenBlock.tsx`
- Create: `apps/web/app/_public/landing/AgBlock.tsx`
- Create: `apps/web/app/_public/landing/ConnectBlock.tsx`

**Interfaces:**

- Consumes: `listGroups(db, { status: "active" })` → `GroupSummary[]` (`{ id, slug, name, city, status }`) from `@bdas/groups`; `AGS` from Task 5; `Section` from Task 2; `loadViewer` from `_dashboard/session`.
- Produces: `<Hero />`, `<GruppenBlock />` (async), `<AgBlock />`, `<ConnectBlock loggedIn />` — assembled by Task 8.

- [ ] **Step 1: HeroSlideshow client component**

`apps/web/app/_public/landing/HeroSlideshow.tsx`. Placeholder "images" are brand-toned CSS gradients — swap for `next/image` files later by editing `SLIDES` only. Pause control satisfies WCAG 2.2.2; `prefers-reduced-motion` disables auto-advance entirely:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

/** Placeholder slides: brand-toned gradients. Replace with photo URLs later. */
const SLIDES: ReadonlyArray<string> = [
  "linear-gradient(135deg, #7a1414, #d12020)",
  "linear-gradient(135deg, #333333, #7a1414)",
  "linear-gradient(135deg, #d12020, #333333)",
];

const INTERVAL_MS = 6000;

export function HeroSlideshow({ children }: { children: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (paused || reducedMotion.current) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused]);

  return (
    <div className="relative min-h-[70vh] overflow-hidden">
      {SLIDES.map((bg, i) => (
        <div
          key={bg}
          aria-hidden
          className="absolute inset-0 transition-opacity duration-bdas-slow ease-bdas"
          style={{ backgroundImage: bg, opacity: i === index ? 1 : 0 }}
        />
      ))}
      <div className="absolute inset-0 bg-bdas-hero-scrim" />
      <div className="relative z-10 flex min-h-[70vh] items-center">{children}</div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? "Diashow fortsetzen" : "Diashow pausieren"}
        className="absolute bottom-4 right-4 z-20 rounded-bdas-pill border border-bdas-strong bg-bdas-surface px-3 py-1 text-bdas-pill text-bdas-ink"
      >
        {paused ? "▶" : "⏸"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Hero server wrapper**

`apps/web/app/_public/landing/Hero.tsx`:

```tsx
import Link from "next/link";

import { HeroSlideshow } from "./HeroSlideshow";

export function Hero() {
  return (
    <HeroSlideshow>
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16">
        <h1 className="max-w-2xl text-4xl font-semibold text-white sm:text-5xl">
          Bund der Alevitischen Studierenden in Deutschland
        </h1>
        {/* Platzhalter-Tagline — finaler Satz kommt vom Bundesvorstand (Spec §8). */}
        <p className="max-w-xl text-lg text-white/90">
          Alevitische Studierende an deutschen Hochschulen — vernetzt, sichtbar, gemeinsam.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/#gruppen"
            className="inline-flex items-center rounded-bdas bg-bdas-red px-5 py-2.5 font-medium text-white transition-colors duration-bdas-quick ease-bdas hover:brightness-110"
          >
            Finde deine Gruppe
          </Link>
          <Link
            href="/registrieren"
            className="inline-flex items-center rounded-bdas border border-bdas-strong bg-bdas-surface px-5 py-2.5 font-medium text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-hover"
          >
            Mitglied werden
          </Link>
        </div>
      </div>
    </HeroSlideshow>
  );
}
```

- [ ] **Step 3: Gruppen block**

`apps/web/app/_public/landing/GruppenBlock.tsx`. This block is the future map's home — when the map project ships, only this file's grid swaps out:

```tsx
import Link from "next/link";

import { getDb } from "@bdas/db";
import { Card, Section } from "@bdas/design-system";
import { listGroups } from "@bdas/groups";

const MAX_CARDS = 8;

export async function GruppenBlock() {
  const groups = await listGroups(getDb(), { status: "active" });
  const shown = groups.slice(0, MAX_CARDS);

  return (
    <Section
      id="gruppen"
      title={`Vor Ort an ${groups.length} Hochschulen`}
      intro="Finde die BDAS-Gruppe an deiner Hochschule."
      action={
        <Link href="/gruppen" className="text-bdas-red hover:underline">
          Alle Gruppen →
        </Link>
      }
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((g) => (
          <li key={g.id}>
            <Link href={`/gruppen/${g.slug}`} className="block focus:outline-none">
              <Card className="h-full p-4">
                <h3 className="font-semibold text-bdas-ink">{g.name}</h3>
                <p className="text-sm text-bdas-ink-muted">{g.city}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
```

- [ ] **Step 4: AG block**

`apps/web/app/_public/landing/AgBlock.tsx`:

```tsx
import Link from "next/link";

import { Card, Section } from "@bdas/design-system";

import { AGS } from "../ags";

export function AgBlock() {
  return (
    <Section
      title="Unsere Arbeit"
      intro="In Arbeitsgruppen organisieren wir uns über Gruppengrenzen hinweg."
      action={
        <Link href="/unsere-arbeit" className="text-bdas-red hover:underline">
          Mehr erfahren →
        </Link>
      }
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AGS.map((ag) => (
          <li key={ag.slug}>
            <Card className="h-full p-4">
              <h3 className="font-semibold text-bdas-ink">{ag.name}</h3>
              <p className="text-sm text-bdas-ink-body">{ag.teaser}</p>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
```

- [ ] **Step 5: Connect block**

`apps/web/app/_public/landing/ConnectBlock.tsx`:

```tsx
import Link from "next/link";

import { Card, Section } from "@bdas/design-system";

const FEATURES = [
  { title: "Events & Anmeldung", text: "Veranstaltungen entdecken und mit einem Klick anmelden." },
  {
    title: "Dateien & Vorlagen",
    text: "Gemeinsame Dokumente, Vorlagen und Materialien an einem Ort.",
  },
  { title: "Dein Netzwerk", text: "Deine Gruppe, deine Leute — bundesweit verbunden." },
] as const;

export function ConnectBlock({ loggedIn }: { loggedIn: boolean }) {
  return (
    <Section title="BDAS-Connect" intro="Die Plattform für Mitglieder.">
      <div className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title} className="p-4">
            <h3 className="font-semibold text-bdas-ink">{f.title}</h3>
            <p className="text-sm text-bdas-ink-body">{f.text}</p>
          </Card>
        ))}
      </div>
      <div className="mt-6">
        <Link
          href={loggedIn ? "/account" : "/registrieren"}
          className="inline-flex items-center rounded-bdas bg-bdas-red px-5 py-2.5 font-medium text-white transition-colors duration-bdas-quick ease-bdas hover:brightness-110"
        >
          {loggedIn ? "Zu deinem Bereich" : "Jetzt registrieren"}
        </Link>
      </div>
    </Section>
  );
}
```

- [ ] **Step 6: Verify + commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (blocks are unwired until Task 8 — that's fine, they compile)

```bash
git add apps/web/app/_public/landing
git commit -m "feat(web): landing blocks — hero with pause, gruppen, AGs, connect"
```

---

### Task 8: `NewsSource` contract + Aktuelles block + landing assembly

**Files:**

- Create: `apps/web/app/_public/news.ts`
- Create: `apps/web/app/_public/news.test.ts`
- Create: `apps/web/app/_public/landing/AktuellesBlock.tsx`
- Create: `apps/web/app/_public/landing/LegacyLanding.tsx` (extracted old page)
- Modify: `apps/web/app/page.tsx` (flag branch)

**Interfaces:**

- Produces: `type NewsItem = { id, title, teaser, publishedAt: Date, href: string | null }`; `type NewsSource = { listLatest(n: number): Promise<ReadonlyArray<NewsItem>> }`; `placeholderNewsSource: NewsSource`. The blog module later exports a `NewsSource` implementation and only the one import in `AktuellesBlock` changes.

- [ ] **Step 1: Write the failing test**

`apps/web/app/_public/news.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { placeholderNewsSource } from "./news";

describe("placeholderNewsSource", () => {
  it("returns at most n items, newest first", async () => {
    const items = await placeholderNewsSource.listLatest(2);
    expect(items.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.publishedAt.getTime()).toBeGreaterThanOrEqual(
        items[i]!.publishedAt.getTime(),
      );
    }
  });

  it("placeholder items are non-clickable (href null) until the blog exists", async () => {
    const items = await placeholderNewsSource.listLatest(3);
    expect(items.every((i) => i.href === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test`
Expected: FAIL — `Cannot find module './news'`

- [ ] **Step 3: Implement the news contract**

`apps/web/app/_public/news.ts`:

```ts
/** News feed contract for the landing's Aktuelles block. The blog module
 *  (issue #50) later ships the real implementation; the landing consumes
 *  only this interface (spec §4.3). */
export type NewsItem = {
  readonly id: string;
  readonly title: string;
  readonly teaser: string;
  readonly publishedAt: Date;
  /** null = not clickable (placeholder era: no blog detail pages yet). */
  readonly href: string | null;
};

export type NewsSource = {
  listLatest(n: number): Promise<ReadonlyArray<NewsItem>>;
};

/** Manual announcements until the blog module exists. The board can edit
 *  this array; an empty array hides the Aktuelles block entirely. */
const PLACEHOLDER_ITEMS: ReadonlyArray<NewsItem> = [
  {
    id: "platzhalter-3",
    title: "BDAS-Connect geht an den Start",
    teaser: "Unsere neue Plattform für Mitglieder: Events, Dateien und dein Netzwerk.",
    publishedAt: new Date("2026-07-01"),
    href: null,
  },
  {
    id: "platzhalter-2",
    title: "Bundeskonferenz 2026",
    teaser: "Die Hochschulgruppen kommen zusammen — Rückblick folgt.",
    publishedAt: new Date("2026-06-15"),
    href: null,
  },
  {
    id: "platzhalter-1",
    title: "Neue Hochschulgruppen im BDAS",
    teaser: "Der Verband wächst: neue Gruppen an weiteren Standorten.",
    publishedAt: new Date("2026-05-20"),
    href: null,
  },
];

export const placeholderNewsSource: NewsSource = {
  listLatest: (n) =>
    Promise.resolve(
      [...PLACEHOLDER_ITEMS]
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, n),
    ),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test`
Expected: PASS

- [ ] **Step 5: Aktuelles block**

`apps/web/app/_public/landing/AktuellesBlock.tsx`. The "Zum Blog" action renders only when the blog flag is on (spec §3):

```tsx
import Link from "next/link";

import { Card, Section } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";

import { placeholderNewsSource, type NewsItem } from "../news";

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" });

function NewsCard({ item }: { item: NewsItem }) {
  const body = (
    <Card className="h-full p-5">
      <p className="text-sm text-bdas-ink-muted">{dateFmt.format(item.publishedAt)}</p>
      <h3 className="mb-2 mt-1 font-semibold text-bdas-ink">{item.title}</h3>
      <p className="text-sm text-bdas-ink-body">{item.teaser}</p>
    </Card>
  );
  return item.href ? (
    <Link href={item.href} className="block focus:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

export async function AktuellesBlock() {
  const items = await placeholderNewsSource.listLatest(3);
  if (items.length === 0) return null;

  return (
    <Section
      title="Aktuelles"
      action={
        isFlagOn("blog") ? (
          <Link href="/blog" className="text-bdas-red hover:underline">
            Zum Blog →
          </Link>
        ) : null
      }
    >
      <ul className="grid gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <NewsCard item={item} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
```

- [ ] **Step 6: Extract the legacy landing**

Create `apps/web/app/_public/landing/LegacyLanding.tsx`: move the **entire current body** of `apps/web/app/page.tsx` into it unchanged — rename the function `HomePage` → `LegacyLanding`, keep all imports (fix their relative paths: `./_dashboard/session` → `../../_dashboard/session` etc.). No visual change.

- [ ] **Step 7: New landing page with flag branch**

Replace `apps/web/app/page.tsx` with:

```tsx
import { isFlagOn } from "@bdas/feature-flags";

import { loadViewer } from "./_dashboard/session";
import { AgBlock } from "./_public/landing/AgBlock";
import { AktuellesBlock } from "./_public/landing/AktuellesBlock";
import { ConnectBlock } from "./_public/landing/ConnectBlock";
import { GruppenBlock } from "./_public/landing/GruppenBlock";
import { Hero } from "./_public/landing/Hero";
import { LegacyLanding } from "./_public/landing/LegacyLanding";

export default async function HomePage() {
  if (!isFlagOn("public_shell")) return <LegacyLanding />;

  const me = await loadViewer();
  return (
    <main className="flex flex-col">
      <Hero />
      {isFlagOn("groups") ? <GruppenBlock /> : null}
      <AktuellesBlock />
      {/* Events-Kalender block lands in Task 9 */}
      <AgBlock />
      <ConnectBlock loggedIn={me !== null} />
    </main>
  );
}
```

- [ ] **Step 8: Verify + commit**

Run: `pnpm -C apps/web test && pnpm typecheck && pnpm lint`. Dev-check both flag states of `/`.
Expected: PASS; flag off renders the old landing pixel-identically.

```bash
git add apps/web/app/_public apps/web/app/page.tsx
git commit -m "feat(web): NewsSource contract, Aktuelles block, landing assembly behind flag"
```

---

### Task 9: Events calendar (Schedule-X island + filter chips)

**Files:**

- Create: `apps/web/app/_public/landing/calendar-events.ts`
- Create: `apps/web/app/_public/landing/calendar-events.test.ts`
- Create: `apps/web/app/_public/landing/EventCalendar.tsx` (client)
- Create: `apps/web/app/_public/landing/KalenderBlock.tsx` (server)
- Modify: `apps/web/app/page.tsx` (insert block)
- Modify: `apps/web/package.json` (deps)

**Interfaces:**

- Consumes: `listUpcomingEvents(db, viewer)` → `ReadonlyArray<EventWithCounts>` (`EventItem` fields incl. `id, title, startsAt: Date, endsAt: Date | null, groupId: string | null`); `viewerFrom(me)` from `apps/web/lib/event-viewer.ts`; `listGroups` from `@bdas/groups`; `FilterChip` from Task 2.
- Produces: `type CalendarEvent = { id: string; title: string; start: string; end: string; groupId: string | null }` (start/end in Schedule-X's `"YYYY-MM-DD HH:mm"` format); `toCalendarEvents(events)`.

- [ ] **Step 1: Install Schedule-X**

Run: `pnpm -C apps/web add @schedule-x/calendar @schedule-x/react @schedule-x/theme-default`
Expected: three packages added. Check the installed major version's docs if the API below fails to typecheck (`node_modules/@schedule-x/react/dist/index.d.ts`).

- [ ] **Step 2: Write the failing serializer test**

`apps/web/app/_public/landing/calendar-events.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { toCalendarEvents } from "./calendar-events";

const base = {
  id: "ev-1",
  groupId: null,
  title: "Bundeskonferenz",
  descriptionMd: null,
  startsAt: new Date(2026, 8, 5, 14, 30), // 2026-09-05 14:30 local
  endsAt: new Date(2026, 8, 5, 18, 0),
  location: null,
  locationUrl: null,
  content: null,
  coverImageKey: null,
  summary: null,
  registrationDeadline: null,
  locationName: null,
  locationAddress: null,
  locationLat: null,
  locationLng: null,
  capacity: null,
  visibility: "public" as const,
  status: "published" as const,
  createdBy: "m-1",
  confirmedCount: 0,
  waitlistCount: 0,
};

describe("toCalendarEvents", () => {
  it("formats start/end as YYYY-MM-DD HH:mm", () => {
    const [ev] = toCalendarEvents([base]);
    expect(ev).toEqual({
      id: "ev-1",
      title: "Bundeskonferenz",
      start: "2026-09-05 14:30",
      end: "2026-09-05 18:00",
      groupId: null,
    });
  });

  it("defaults a missing end to one hour after start", () => {
    const [ev] = toCalendarEvents([{ ...base, endsAt: null }]);
    expect(ev!.end).toBe("2026-09-05 15:30");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -C apps/web test`
Expected: FAIL — `Cannot find module './calendar-events'`

- [ ] **Step 4: Implement the serializer**

`apps/web/app/_public/landing/calendar-events.ts`:

```ts
import type { EventWithCounts } from "@bdas/events-module";

/** Wire shape passed from the server page into the Schedule-X client island.
 *  start/end use Schedule-X's "YYYY-MM-DD HH:mm" format. */
export type CalendarEvent = {
  readonly id: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly groupId: string | null;
};

const HOUR_MS = 60 * 60 * 1000;

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function toCalendarEvents(events: ReadonlyArray<EventWithCounts>): CalendarEvent[] {
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    start: fmt(e.startsAt),
    end: fmt(e.endsAt ?? new Date(e.startsAt.getTime() + HOUR_MS)),
    groupId: e.groupId,
  }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -C apps/web test`
Expected: PASS

- [ ] **Step 6: Client calendar island**

`apps/web/app/_public/landing/EventCalendar.tsx`. Filter chips re-key the calendar (cheap full remount on filter change — event counts are small). Event click navigates to the existing detail page:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createViewMonthAgenda, createViewMonthGrid } from "@schedule-x/calendar";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";

import { FilterChip } from "@bdas/design-system";

import type { CalendarEvent } from "./calendar-events";

import "@schedule-x/theme-default/dist/index.css";

export type GroupOption = { id: string; name: string };
type Filter = "all" | "federal" | string;

function Calendar({
  events,
  onEventClick,
}: {
  events: CalendarEvent[];
  onEventClick: (id: string) => void;
}) {
  const calendar = useCalendarApp({
    views: [createViewMonthGrid(), createViewMonthAgenda()],
    events: events.map(({ groupId: _g, ...e }) => e),
    locale: "de-DE",
    callbacks: {
      onEventClick: (ev) => onEventClick(String(ev.id)),
    },
  });
  return <ScheduleXCalendar calendarApp={calendar} />;
}

export function EventCalendar({
  events,
  groups,
}: {
  events: CalendarEvent[];
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "federal") return events.filter((e) => e.groupId === null);
    return events.filter((e) => e.groupId === filter);
  }, [events, filter]);

  const groupsWithEvents = groups.filter((g) => events.some((e) => e.groupId === g.id));

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Veranstaltungen filtern"
      >
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Alle
        </FilterChip>
        <FilterChip active={filter === "federal"} onClick={() => setFilter("federal")}>
          Bundesweit
        </FilterChip>
        {groupsWithEvents.map((g) => (
          <FilterChip key={g.id} active={filter === g.id} onClick={() => setFilter(g.id)}>
            {g.name}
          </FilterChip>
        ))}
      </div>
      {/* key remounts Schedule-X when the filter changes */}
      <Calendar
        key={filter}
        events={filtered}
        onEventClick={(id) => router.push(`/events/${id}`)}
      />
    </div>
  );
}
```

- [ ] **Step 7: Theme Schedule-X to the design tokens**

Append to `apps/web/app/globals.css`:

```css
/* Schedule-X → BDAS design tokens (values via the Tailwind preset's source). */
.sx__calendar {
  --sx-color-primary: #d12020; /* brand.red — the one place a hex is allowed: mapping tokens into a third-party variable API */
  border-radius: 12px; /* radii.md */
  border-color: rgba(0, 0, 0, 0.06); /* border.soft */
}
```

> Note for the implementer: if ESLint/review flags these raw values, extract them by importing `colors`/`radii` from `@bdas/design-system` into a small CSS-variable bridge in the layout instead. The constraint is "no _new_ values", not "no mapping".

- [ ] **Step 8: Server block + wire into the landing**

`apps/web/app/_public/landing/KalenderBlock.tsx`:

```tsx
import { getDb } from "@bdas/db";
import { Section } from "@bdas/design-system";
import { listUpcomingEvents } from "@bdas/events-module";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";
import { viewerFrom } from "../../../lib/event-viewer";
import { toCalendarEvents } from "./calendar-events";
import { EventCalendar } from "./EventCalendar";

/** Public calendar with facets: visitors get `public` events; logged-in
 *  members additionally get members_only + their group's group_only events —
 *  the visibility filter runs server-side in listUpcomingEvents. */
export async function KalenderBlock() {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const [events, groups] = await Promise.all([
    listUpcomingEvents(db, viewerFrom(me)),
    listGroups(db, { status: "active" }),
  ]);

  return (
    <Section title="Veranstaltungen" intro="Alle Termine auf einen Blick.">
      <EventCalendar
        events={toCalendarEvents(events)}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      />
    </Section>
  );
}
```

In `apps/web/app/page.tsx`, replace the placeholder comment:

```tsx
import { KalenderBlock } from "./_public/landing/KalenderBlock";
```

```tsx
{
  isFlagOn("events") ? <KalenderBlock /> : null;
}
```

- [ ] **Step 9: Verify + commit**

Run: `pnpm -C apps/web test && pnpm typecheck && pnpm lint`. Dev-check: calendar renders on `/` (flag on), chips filter, event click navigates, mobile width shows agenda view toggle.
Expected: PASS

```bash
git add apps/web/app/_public/landing apps/web/app/page.tsx apps/web/app/globals.css apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): Schedule-X events calendar with filter chips on the landing"
```

---

### Task 10: SEO — metadata base, OG image, sitemap, robots, legacy redirects

**Files:**

- Modify: `apps/web/app/layout.tsx` (metadataBase + description)
- Create: `apps/web/app/opengraph-image.tsx`
- Create: `apps/web/app/sitemap.ts`
- Create: `apps/web/app/robots.ts`
- Modify: `apps/web/next.config.mjs` (redirects)

**Interfaces:**

- Consumes: `PUBLIC_SITE_URL` env; `listGroups`, `listUpcomingEvents(db, ANON)`.

- [ ] **Step 1: metadataBase**

In `apps/web/app/layout.tsx` extend the metadata export:

```tsx
export const metadata: Metadata = {
  metadataBase: new URL(process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000"),
  title: {
    default: "BDAS — Bund der Alevitischen Studierenden",
    template: "%s · BDAS",
  },
  description:
    "Der Bund der Alevitischen Studierenden in Deutschland: Hochschulgruppen, Veranstaltungen und BDAS-Connect, die Plattform für Mitglieder.",
};
```

- [ ] **Step 2: OG image**

`apps/web/app/opengraph-image.tsx` (Next.js file convention; shared by all pages without their own):

```tsx
import { ImageResponse } from "next/og";

export const alt = "BDAS — Bund der Alevitischen Studierenden in Deutschland";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #7a1414, #d12020)",
        color: "#ffffff",
      }}
    >
      <div style={{ fontSize: 120, fontWeight: 700 }}>BDAS</div>
      <div style={{ fontSize: 36 }}>Bund der Alevitischen Studierenden in Deutschland</div>
    </div>,
    size,
  );
}
```

- [ ] **Step 3: robots.ts**

`apps/web/app/robots.ts`:

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/federal", "/gruppe", "/account", "/dateien", "/admin", "/api", "/dashboard"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
```

- [ ] **Step 4: sitemap.ts**

`apps/web/app/sitemap.ts` (public routes + active groups + public upcoming events; ANON viewer so nothing gated leaks):

```ts
import type { MetadataRoute } from "next";

import { getDb } from "@bdas/db";
import { ANON, listUpcomingEvents } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { listGroups } from "@bdas/groups";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000";
  const url = (p: string) => `${base}${p}`;

  const entries: MetadataRoute.Sitemap = [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    { url: url("/ueber-uns"), changeFrequency: "monthly" },
    { url: url("/ueber-uns/verbandsstruktur"), changeFrequency: "monthly" },
    { url: url("/ueber-uns/bdaj"), changeFrequency: "monthly" },
    { url: url("/unsere-arbeit"), changeFrequency: "monthly" },
  ];

  const db = getDb();
  if (isFlagOn("groups")) {
    entries.push({ url: url("/gruppen"), changeFrequency: "weekly" });
    const groups = await listGroups(db, { status: "active" });
    entries.push(...groups.map((g) => ({ url: url(`/gruppen/${g.slug}`) })));
  }
  if (isFlagOn("events")) {
    entries.push({ url: url("/events"), changeFrequency: "daily" });
    const events = await listUpcomingEvents(db, ANON);
    entries.push(...events.map((e) => ({ url: url(`/events/${e.id}`) })));
  }
  return entries;
}
```

- [ ] **Step 5: Legacy WordPress redirects**

In `apps/web/next.config.mjs`, add to `nextConfig`:

```js
  // Legacy WordPress paths (pre-2026 bdas.de). Seed list — extend from the
  // WordPress export before DNS cutover (spec §1 "Legacy URL redirects").
  async redirects() {
    return [
      { source: "/news", destination: "/", permanent: true },
      { source: "/news/:slug", destination: "/", permanent: true },
      { source: "/ueber-uns/:slug((?!verbandsstruktur|bdaj).*)", destination: "/ueber-uns", permanent: true },
      { source: "/kontakt", destination: "/", permanent: true },
      { source: "/mitmachen", destination: "/registrieren", permanent: true },
    ];
  },
```

- [ ] **Step 6: Verify + commit**

Run: `pnpm typecheck && pnpm lint`. Dev-check: `curl localhost:3000/robots.txt`, `curl localhost:3000/sitemap.xml`, `curl -I localhost:3000/news` → 308 to `/`, and view-source of `/` shows `og:image`.
Expected: PASS

```bash
git add apps/web/app/layout.tsx apps/web/app/opengraph-image.tsx apps/web/app/sitemap.ts apps/web/app/robots.ts apps/web/next.config.mjs
git commit -m "feat(web): SEO — metadata, OG image, sitemap, robots, legacy redirects"
```

---

### Task 11: E2E — public shell walk + facets test

**Files:**

- Modify: `e2e/helpers/db.ts` (add `seedEvent`)
- Create: `e2e/public-shell.e2e.ts`

**Interfaces:**

- Consumes: existing helpers `seedGroup`, `uniqueSlug`, `uniqueEmail`, `registerVerifyLogin` (from `e2e/helpers/flows.ts` — read its signature before use), and the new `seedEvent`.
- Precondition: the e2e environment runs with `BDAS_FLAG_PUBLIC_SHELL=true` (add it wherever the CI workflow sets the other `BDAS_FLAG_*` vars — check `.github/workflows/`).

- [ ] **Step 1: Add `seedEvent` helper**

Append to `e2e/helpers/db.ts` (same raw-SQL style as `seedGroup`; check `seedGroup`'s implementation for the exact insert idiom and reuse it):

```ts
export async function seedEvent(input: {
  title: string;
  groupId: string | null;
  visibility: "public" | "members_only" | "group_only";
  startsAt: Date;
  createdBy: string;
}): Promise<string> {
  const rows = await sql`
    insert into events (id, group_id, title, starts_at, visibility, status, created_by, created_at)
    values (gen_random_uuid(), ${input.groupId}, ${input.title}, ${input.startsAt},
            ${input.visibility}, 'published', ${input.createdBy}, now())
    returning id
  `;
  return rows[0]!["id"] as string;
}
```

> The `events` table may have NOT NULL columns beyond these (check `modules/events/src/schema.ts`); add defaults to the insert as needed.

- [ ] **Step 2: Write the e2e spec**

`e2e/public-shell.e2e.ts`:

```ts
/**
 * Public shell (spec 2026-07-05): visitor navigation walk + the facets
 * guarantee — a logged-in member sees strictly more events than a visitor.
 */
import { expect, test } from "@playwright/test";

import { memberIdByEmail, seedEvent, seedGroup, uniqueEmail, uniqueSlug } from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";

test("visitor walks the public nav", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Bund der Alevitischen Studierenden/ }),
  ).toBeVisible();

  // Static pages via the Über-uns dropdown
  await page.getByText("Über uns").click();
  await page.getByRole("link", { name: "Kurzportrait" }).click();
  await page.waitForURL("**/ueber-uns");
  await expect(page.getByRole("heading", { name: "Über uns" })).toBeVisible();

  await page.goto("/unsere-arbeit");
  await expect(page.getByText("Ingenieurwesen & Technik")).toBeVisible();

  // Visitor CTAs present
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Mitglied werden" }).first()).toBeVisible();
});

test("facets: member sees members-only event, visitor does not", async ({ page }) => {
  const slug = uniqueSlug("e2e-shell");
  await seedGroup({ slug, name: "E2E Shell Gruppe", city: "Teststadt", status: "active" });

  const email = uniqueEmail("shell-member");
  await registerVerifyLogin(page, email); // check flows.ts for exact signature/args

  const memberId = await memberIdByEmail(email);
  const title = `Interner Termin ${slug}`;
  await seedEvent({
    title,
    groupId: null,
    visibility: "members_only",
    startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdBy: memberId!,
  });

  // Logged-in member (must be active status — check flows.ts helpers for activation) sees it
  await page.goto("/");
  await expect(page.getByText(title)).toBeVisible();

  // Fresh anonymous context does not
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page.getByText(title)).toHaveCount(0);
});
```

> Implementation note: the member must have `status = 'active'` for `members_only` visibility (see `Viewer.isActiveMember`). Check `e2e/helpers` for an existing activation helper (board approval flow or a direct `memberStatusByEmail`-style SQL update); if none exists, add `activateMemberByEmail(email)` to `db.ts` as a one-line `update members set status='active'`.

- [ ] **Step 3: Run**

Run: `pnpm e2e public-shell.e2e.ts` (with `BDAS_FLAG_PUBLIC_SHELL=true` in the e2e env)
Expected: 2 passed

- [ ] **Step 4: Add the flag to CI**

In the GitHub Actions workflow that runs Playwright (find it: `grep -rn "BDAS_FLAG_EVENTS" .github/workflows/`), add `BDAS_FLAG_PUBLIC_SHELL: "true"` alongside the other flags.

- [ ] **Step 5: Commit**

```bash
git add e2e/public-shell.e2e.ts e2e/helpers/db.ts .github/workflows/
git commit -m "test(e2e): public shell nav walk + facets visibility test"
```

---

### Task 12: Final verification + go-live notes

**Files:**

- Modify: `docs/superpowers/specs/2026-07-05-public-shell-design.md` (tick nothing — just verify)

- [ ] **Step 1: Full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e`
Expected: all green

- [ ] **Step 2: Flag-off regression**

With `BDAS_FLAG_PUBLIC_SHELL=false`: `/` renders the legacy landing, old header/footer, `/ueber-uns` → 404. No visual diff against production.

- [ ] **Step 3: Lighthouse**

Run: `pnpm -C apps/web build && pnpm -C apps/web start`, then Chrome DevTools → Lighthouse → Mobile against `/`, `/ueber-uns`, `/unsere-arbeit`. Target: Accessibility ≥ 90, Performance ≥ 90 (spec §6). Fix findings before merge.

- [ ] **Step 4: PR + review**

One PR for the whole shell (app-layer feature, flag-gated, no module surgery). Run `/review` on it. Not auth/payments/files — `/security-review` not mandatory, but the sitemap/calendar use the ANON/viewer path; confirm no gated titles leak in the flag-off + logged-out states.

**Go-live (owner, after merge — from the spec):** flip `BDAS_FLAG_PUBLIC_SHELL=true` in Vercel → DNS Phase B (bdas.de → Vercel, `PUBLIC_SITE_URL=https://bdas.de`) → Datenschutz/Impressum legal review → extend the redirect map from the WordPress export.

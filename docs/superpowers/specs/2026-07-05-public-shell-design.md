# Public Shell — Design

**Date:** 2026-07-05
**Status:** Approved (brainstormed with product owner)
**Scope:** Navigation + landing page + static content pages for bdas.de. The public face of the platform.

---

## 1. Context and decisions

The platform (currently at dashboard.bdas.de) becomes the federation's entire web presence at **bdas.de** — public pages and logged-in platform on **one host**. This reverses the spec §3 non-goal ("public marketing/blog website out of scope") and is driven by:

- The session cookie is host-only (ADR 0003). Splitting public/logged-in across domains would make the login invisible on the public pages.
- The product vision is **progressive disclosure** ("facets"): the same public pages reveal more to logged-in users by role — blog visibility tiers (issue #50), members-only events in the public calendar, member details on group pages. That only works when the public pages can read the session.
- Issue #24 (Startseite ↔ platform disconnected) is resolved by unifying them.

**To be recorded as a new ADR** ("Public web presence lives in the platform"): the non-goal reversal, the single-host decision, and the Schedule-X dependency.

### Domain move (owner-executed, not code)

- **Phase A (now, zero risk):** back up WordPress content + media (may seed the future blog module); inventory the bdas.de DNS zone — especially MX records (mail may live at the WordPress hoster) and Resend TXT records (must stay).
- **Phase B (at go-live, ~15 min):** add `bdas.de` + `www.bdas.de` to the Vercel project; point apex A → `76.76.21.21`, www CNAME → `cname.vercel-dns.com`; leave MX/TXT untouched. Set `PUBLIC_SITE_URL=https://bdas.de` in Vercel (and GitHub secrets if present); redeploy. Remove `dashboard.bdas.de` when ready. Known effects: all sessions invalidate (one re-login), old unclicked email links break (re-request).
- **Phase C (later):** cancel WordPress hosting (issue #32) — only after confirming MX/email does not depend on that package.

`PUBLIC_SITE_URL` is the only functional domain reference in the codebase. `DASHBOARD_URL` in `.env.example` is unused and should be deleted.

---

## 2. Goals and non-goals

**Audience priority:** prospective members first (recruit, "find your group"), public/institutions second (represent). Logged-in users see progressively more on the same pages.

**In scope:** new header/footer/navigation · rebuilt landing page · static pages Kurzportrait, Verbandsstruktur, BDAJ, Unsere Arbeit (AGs) · Schedule-X events calendar on the landing · feature flag + rollout.

**Explicitly out of scope (each a later project):**

- Blog module (issue #50) — the landing's news block runs on a placeholder source until then
- Germany map with OpenStreetMap on `/gruppen` — the landing's Gruppen block reserves its slot
- Group profile page editor (issue #48)
- Guest event registration (events Slice 4)
- Spenden / payments (Phase 6), Kontakt page, English toggle
- Real copy and photos — placeholders now, board delivers content later

---

## 3. Information architecture

### Routes

| Route | Page | Content source |
|---|---|---|
| `/` | Landing (rebuilt) | mixed, see §4 |
| `/ueber-uns` | Kurzportrait | placeholder copy |
| `/ueber-uns/verbandsstruktur` | Verbandsstruktur | placeholder copy |
| `/ueber-uns/bdaj` | BDAJ portrait + link to bdaj.de | placeholder copy |
| `/unsere-arbeit` | AG overview | hardcoded AG list |
| `/gruppen`, `/events` | existing | live modules |
| `/blog` | future blog module | — |

The four AGs (hardcoded list, no module/tables — YAGNI): Öffentlichkeitsarbeit/Social Media · Medizin · Ingenieurwesen & Technik · Jura.

### Header (desktop)

```
LOGO   Über uns ▾   Unsere Arbeit   Events   Blog   Gruppen      [Mitglied werden] [Anmelden]
       ├ Kurzportrait
       ├ Verbandsstruktur
       └ Bund der Alevitischen Jugendlichen (BDAJ)
```

- `Gruppen` is deliberately top-level (strongest recruitment asset, future map centerpiece).
- The `Blog` nav item renders only when the blog module's feature flag is on — no dead link before then. Same for the Aktuelles block's "Zum Blog" button.
- `Mitglied werden` is a brand-red button, `Anmelden` quiet — both always visible to visitors.
- No Spenden/Kontakt in the header (payments is Phase 6; Kontakt lives in the footer).

**Three states:** visitor (CTAs as above) · member (CTAs → account menu: name, `/account`, Abmelden) · board (account menu additionally links to `/federal/…` or `/gruppe/[slug]/…`).

**Mobile:** hamburger → full-screen menu; the Über-uns dropdown becomes the canonical `<details>` accordion idiom.

### Footer (site-wide)

Kontakt block · quick links (Über uns, Events, Blog, Gruppen) · BDAJ + AABF links · Impressum/Datenschutz · social icons. Placeholder contact/handles until provided.

---

## 4. Landing page blocks

Order: **Hero → Gruppen → Aktuelles → Events-Kalender → Unsere Arbeit → BDAS-Connect → Footer.**

1. **Hero** — ~80vh photo slideshow, 3–4 images cross-fading (~6s interval, 400ms fade token; static image under `prefers-reduced-motion`). Dark gradient overlay; title "Bund der Alevitischen Studierenden in Deutschland" + placeholder tagline + CTAs **Finde deine Gruppe** (→ `#gruppen` anchor) and **Mitglied werden** (→ `/registrieren`). Images: brand-toned gradient placeholders in one swappable folder.
2. **Gruppen** — "Vor Ort an XX Hochschulen" (live count via groups module). Grid of up to ~8 group cards (name, city → `/gruppen/[slug]`) + "Alle Gruppen" → `/gruppen`. Layout reserves this block as the future map's home — map swaps in without landing redesign.
3. **Aktuelles** — 3 news cards (image, date, title, teaser) + "Zum Blog". Fed by a typed `NewsSource` interface; placeholder array implementation in `apps/web` now, blog module implements the same interface later. Empty source ⇒ block hidden. Until the blog module ships: placeholder cards are non-clickable teasers (the board can use them for manual announcements), and the "Zum Blog" button is hidden — same mechanism as the nav item, below.
4. **Events-Kalender** — Schedule-X island. Month grid desktop, agenda view mobile, German locale, token-themed. Filter chips above: **Alle · Bundesweit · Gruppe ▾**. Visitors see `public` events; logged-in members additionally see `members_only` + their group's `group_only` events (facets principle, server-side filtered). Event click → `/events/[id]`.
5. **Unsere Arbeit** — four AG cards (icon, name, one placeholder sentence) → `/unsere-arbeit`.
6. **BDAS-Connect** — platform pitch ("BDAS-Connect — die Plattform für Mitglieder", working name): three feature bullets (Events & Anmeldung, Dateien & Vorlagen, Netzwerk). CTA **Jetzt registrieren**, flips to **Zu deinem Bereich** when logged in.

Blocks 2 + 4 are live data on day one; 1, 3, 5 are placeholder-fed.

---

## 5. Technical architecture

- **Routing:** new `apps/web/app/(public)/` route group carrying the new header/footer layout (landing, static pages, auth pages). Board/account routes keep their layouts.
- **Components:** `apps/web/app/_public/` for app-private blocks (mirrors `_events`/`_groups` convention). Genuinely reusable primitives go to `core/design-system`: nav dropdown (20px pill radius), hero slideshow, section wrapper, filter chips. Everything consumes tokens; missing values (e.g. overlay gradient) are added to `tokens.ts`, never inlined.
- **Data flow (rule 1):** landing is a Server Component calling only public module interfaces — `listGroups()`, `listUpcomingEvents(viewer)` with viewer built from the session, `NewsSource.listLatest(3)`. No SQL in the app layer.
- **Schedule-X:** `@schedule-x/calendar` + React wrapper (MIT). Client component via `next/dynamic`; server HTML streams first, calendar hydrates after. Events serialized server-side, passed as props — the island makes no API calls. Themed by mapping Schedule-X CSS variables to design tokens.
- **Feature flag:** `BDAS_FLAG_PUBLIC_SHELL` — off ⇒ current landing/header; on ⇒ new shell. Enables incremental merges to prod; flipping it on is the go-live, coordinated with DNS Phase B.

---

## 6. Testing

- Unit/component: `NewsSource` contract, header role states, calendar event serialization — the visibility filtering per viewer is the security-relevant part and gets exhaustive cases (anon / member / member-of-group / board).
- E2E (Playwright, `e2e/`): walk public pages as visitor and as member; assert the member sees strictly more (facets test).
- Lighthouse mobile ≥ 90 on all new pages (spec §20).

---

## 7. Build order (each step mergeable behind the flag)

1. Design-system additions + header/footer + `(public)` layout
2. Static pages with placeholder copy
3. Landing blocks: Hero, Gruppen, AGs, Connect
4. Aktuelles block + `NewsSource` contract
5. Events-Kalender (Schedule-X island, filter chips, visibility serialization)
6. E2E + Lighthouse → flip flag → DNS Phase B → bdas.de live

---

## 8. Open items (owner / board)

Tagline sentence · Kurzportrait/Verbandsstruktur/BDAJ/AG copy · photo pool with publication consent · contact block details · social handles · final confirmation of "BDAS-Connect" naming.

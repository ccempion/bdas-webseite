# ADR 0008 — GDPR posture for Phase 1

- **Status:** Accepted (§3 amended by ADR 0009)
- **Date:** 2026-05-18
- **Supersedes:** —
- **Superseded by:** ADR 0009 — *§3 only* (legal pages are now in-app routes, not WordPress pages). §1, §2, and §4 stand.

## Context

Spec §20 lists, under non-functional requirements: _"GDPR: explicit consent
at registration, data export self-service in `/account`, account deletion
that cascades to all modules within 30 days"_ and _"Cookie banner with
privacy-preserving defaults."_ The build plan's Sprint 5 ("Phase-1 acceptance
pass") turns these into concrete deliverables: consent on register, a cookie
banner, a data-export endpoint stub, German-strings audit, Lighthouse ≥ 90.

The spec is a product document, not a legal one. Two of these items have a
legal shape the spec doesn't fully resolve, and the spec architecture (§27:
WordPress is the board-edited content layer) constrains where legal text
lives. These are federation decisions per build-plan §6; the rulings below
were taken with the product owner and are recorded here. Per CLAUDE.md §8 an
ADR supersedes the spec on conflicts.

## Decision

### 1. Explicit consent at registration — required and recorded

Registration requires the user to actively accept the Datenschutzerklärung
(privacy policy). The acceptance is **persisted for accountability** (GDPR
Art. 7(1) — the controller must be able to demonstrate consent):

- `auth_users` gains `consent_at timestamptz` and `consent_version text`
  (migration `modules/auth/migrations/0002_consent.sql`).
- `auth` exports a `CONSENT_VERSION` constant. `register()` requires
  `consent === true` (a `z.literal(true)` in `RegisterInput`; rejected with a
  German `ValidationError` otherwise) and stamps `consent_at = now()`,
  `consent_version = CONSENT_VERSION`.
- Consent text/version is bumped by changing the constant when the privacy
  policy materially changes; historical rows keep the version they accepted.

The consent **version** is a server-side constant, not user input — the form
only submits the boolean. The checkbox links to the privacy policy (see §3).

### 2. Cookie information notice, not a consent banner

The platform sets exactly one cookie: the strictly-necessary, `httpOnly`
session JWT (`bdas_session`, ADR 0002). There is no analytics, advertising,
or other non-essential storage in Phase 1.

Under § 25 (2) TTDSG and GDPR Art. 6(1)(f), cookies strictly necessary to
provide a service the user explicitly requested (here: staying logged in)
require **information, not prior consent**. A consent banner with an
accept/reject choice would be performative — the "reject" path cannot
disable a strictly-necessary cookie without breaking login.

Phase 1 therefore ships an **informational cookie notice** (dismissible,
no accept/reject control) plus a footer link to the Datenschutzerklärung —
not a consent banner. This supersedes the literal "cookie banner" wording in
spec §20 for Phase 1. The notice component is structured so that, when a
non-essential cookie is introduced (e.g. analytics in a later phase), it can
be upgraded to a true consent banner without re-architecting.

Dismissal state is kept in `localStorage`, not a cookie — it is functional
client state, sets nothing readable cross-site, and so does not itself
create a consent obligation.

### 3. Legal content lives in WordPress, linked by env URL

> **Amended by ADR 0009 (2026-06-08):** the platform is now standalone, so the
> Datenschutzerklärung and Impressum are hosted **in-app** as routes
> (`/datenschutz`, `/impressum`), not in WordPress. The `LEGAL_PRIVACY_URL` /
> `LEGAL_IMPRINT_URL` env vars are removed. The original ruling below is kept
> as historical record.

Per spec §27 WordPress is the board-edited content layer. The
Datenschutzerklärung and Impressum are **WordPress pages**, not app routes.
The app links to them via configurable environment variables:

- `LEGAL_PRIVACY_URL` — Datenschutzerklärung (consent checkbox + footer)
- `LEGAL_IMPRINT_URL` — Impressum (footer)

The app neither hosts nor renders the legal text, so boards edit it in
WordPress without an app deploy. These join the existing `App URLs` block in
`.env.example`. If unset in development, the links fall back to `#` and a
build-time note; production must set them.

### 4. Data-export self-service — Phase-1 stub scope

`/account` offers the signed-in user a self-service export of **their own**
data, returned as a JSON download. The export is **authorization-scoped to
the requester** (never another user) and covers only the modules that exist
in Phase 1: the `auth` identity row (id, email, status, timestamps, consent)
and the `members` profile + effective grants. It explicitly does **not**
cover not-yet-built modules (events, files, payments).

Account **deletion** with a 30-day cascade (spec §503) is **out of Phase-1
scope** — it depends on modules that don't exist yet and is sequenced with
Phase 6. The export is the Phase-1 GDPR self-service surface; deletion is a
documented follow-up, not a silent gap.

## Alternatives considered

### Full cookie consent banner (literal spec §20)

**Rejected for Phase 1** — with only a strictly-necessary cookie, an
accept/reject banner is legally unnecessary (§ 25 (2) TTDSG) and its reject
path is a no-op. Revisit when a non-essential cookie is introduced; the
notice component is built to upgrade in place.

### In-app `/datenschutz` and `/impressum` placeholder pages

**Rejected** — duplicates the WordPress content layer (spec §27), needs an
app deploy to change legal text, and risks the app copy and the WP copy
drifting. Linking the WP pages keeps one source of truth, board-editable.

### Gate consent without persisting it

**Rejected** — GDPR Art. 7(1) requires the controller to demonstrate that
consent was given. A checkbox with no record cannot. The two-column
migration is cheap and pre-production.

## Consequences

### Positive

- Registration is GDPR-compliant and the consent is provable (timestamp +
  version).
- The cookie surface is legally correct for the actual cookie set, with no
  dead UI to maintain.
- Legal text stays board-editable in WordPress; no deploy to amend it.
- Members have a working data-export self-service for all data the platform
  currently holds about them.

### Negative

- A forward-only `auth_users` migration adds two columns; pre-production so
  no real data is affected (cf. ADR 0006/0007).
- `RegisterInput` gains a required `consent` field — every `register()`
  call site (services, tests, the web action) updates in the same PR.
- Spec §20's "cookie banner" wording and the §503 deletion timeline diverge
  from the implementation until the spec is amended; this ADR is the source
  of truth in the interim.
- The data export is intentionally partial (built modules only); this is
  documented in the export payload itself to set user expectations.

## Follow-ups

- Upgrade the cookie notice to a consent banner when the first non-essential
  cookie/analytics is introduced.
- Account deletion with cross-module 30-day cascade — Phase 6 (spec §503).
- Extend the data export as `events` / `files` / `payments` modules land
  (each module contributes its own slice through its public interface).
- Amend spec §20 / §503 (or add a pointer here) at the next spec revision.

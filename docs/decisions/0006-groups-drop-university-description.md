# ADR 0006 — Groups: drop `university` and `description`

- **Status:** Accepted
- **Date:** 2026-05-18
- **Supersedes:** —
- **Superseded by:** —

## Context

The product spec §9 sketches the `groups` table with `university` and
`description_md` columns, and the Phase-1 build implemented `university` and a
plain-text `description`. While testing the federal-board group-management UI
(the §23 "create / edit / archive a group" criterion), the federation product
owner determined both fields are unwanted:

- **`university`** — a Hochschulgruppe is anchored to a _city_, not a single
  university. German cities routinely host several universities, so asking a
  board member to pick one is misleading and produces inconsistent data.
- **`description`** — a free-text blurb on the group profile is not desired
  for Phase 1; the public profile carries name, city, status, and contact.

Per CLAUDE.md §8, ADRs take precedence over the spec on conflicts. This is a
deliberate product decision by the federation (the legitimate owner of the
spec's open content), not a unilateral implementation change.

## Decision

Remove `university` and `description` from the `groups` module entirely:

- DB columns dropped via `modules/groups/migrations/0003_drop_university_description.sql`.
- Removed from `schema.ts`, the `Group` type, and all services
  (`get`, `list`, `upsert`, `manage`).
- Removed from the admin `GroupForm` and the public `/gruppen/[slug]` profile.
- Module integration tests updated to assert on other mutable fields.

The spec text is now superseded by this ADR on these two columns. The
`groups` table for Phase 1 is: `id, slug, name, city, contact_email,
instagram_url, website_url, status` (+ timestamps). `join_fee_*` remains
deferred to Phase 6 as before.

## Alternatives considered

### Hide the fields in the UI only

Keep the columns and the public rendering, just drop the form inputs.
**Rejected** — leaves dead columns and an empty "Beschreibung" region on the
public profile; contradicts the reason for removal (the data should not exist).

### Keep `university` as a free-text optional field

**Rejected** — the owner's objection is semantic, not UX: a single-university
field is wrong for a city-scoped group regardless of how it is presented.

## Consequences

### Positive

- Data model matches how groups actually exist (city-scoped).
- Smaller public profile and admin form; less to localize/QA.
- No dead columns.

### Negative

- A forward-only `DROP COLUMN` migration: any data previously entered in these
  columns is discarded. Acceptable — the schema is pre-production (local/CI
  only; nothing deployed), so no real data is lost.
- Spec §9 now diverges from the implementation until the spec is amended;
  this ADR is the source of truth in the interim.

## Follow-ups

- Amend spec §9's schema sketch to drop `university` / `description_md` (or add
  a note pointing here) the next time the spec is revised.

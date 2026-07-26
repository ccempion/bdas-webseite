# ADR 0030: Blog authoring rights are "active member or alumnus"

**Status:** Accepted
**Date:** 2026-07-26

## Context

`docs/bdas-platform-spec.md` §4 lists "make posts in blog" as a right of
the Local Board role (inherited by Federal Board), not a general Member
right. The blog module's approved design
(`docs/superpowers/specs/2026-07-22-blog-module-design.md`) deliberately
built a social-feed-style module instead, where any signed-in member may
author and the board moderates after publish. That divergence from the
spec's role table was never recorded as a decision.

A related gap surfaced during the 2026-07-26 filtering/permissions review:
`requirePostAuthor()` checked only "is signed in", not member status — a
`pending` (not yet confirmed by a Local Board) or `inactive` account could
author a post.

## Decision

Blog posting rights are: member status `active` or `alumnus`. `pending`
and `inactive` accounts cannot author. This is enforced centrally in
`apps/web/app/_blog/access.ts`'s `canAuthor()`, used by both the
`/blog/neu` page guard and `createPostAction`.

This explicitly supersedes the platform spec §4 role table's "Local
Board" listing for blog posting, for this module only — other modules'
role rights are unaffected.

## Consequences

- Any active member or alumnus can post without a board role — matches the
  social-feed intent of the 2026-07-22 design.
- Abuse is mitigated by rate-limiting, member reporting, and post-publish
  moderation (author or federal board), not by pre-restricting who may
  author — see `docs/superpowers/specs/2026-07-26-blog-filtering-permissions-design.md`.
- A `pending` member cannot post before a Local Board confirms them; an
  `inactive` (removed) member cannot post at all.

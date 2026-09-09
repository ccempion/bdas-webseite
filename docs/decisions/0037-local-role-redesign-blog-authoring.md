# ADR 0037: Local role redesign — blog authoring is now role-gated, not membership-gated

**Status:** Accepted
**Date:** 2026-09-09
**Supersedes:** ADR 0030 (blog authoring rights)
**Amends:** ADR 0033 (blog comments) — see "Comments are unaffected" below

## Context

This is the last piece of the local-role redesign started in ADR-adjacent
work across this quarter: the old flat `local_board` role was retired
(folded into `local_board_lead`, "Lead"), and two new group-scoped delegate
roles were introduced, `file_manager` ("Datei-Manager") and `blogger`
("Blogger"). `event_organizer` ("Event-Manager" in the UI from this point
on) gains blog-authoring rights alongside its existing event management
rights.

ADR 0030 deliberately opened blog authoring to any active member or alumnus,
independent of any board role, as a considered reversal of the platform
spec's original "Local Board" role-table listing. The federation has now
reconsidered: blog authoring should be a delegated responsibility again,
held by people the federation or a group's Lead has explicitly trusted with
it — not a right every active member holds by default.

## Decision

Blog **authoring** (`createPost`) is now restricted to members holding one
of:

- `federal_board`
- `local_board_lead` ("Lead")
- `event_organizer` ("Event-Manager")
- `blogger` ("Blogger")

Any other active member or alumnus can no longer create a post. This
explicitly **supersedes ADR 0030**.

### Comments are unaffected

ADR 0033 tied comment eligibility to ADR 0030's `canAuthor()` "verbatim,
rather than redefined, so posting rights and commenting rights cannot drift
apart." That reasoning assumed posting and commenting were meant to be the
same population. They are not, going forward: restricting who may start a
post is a moderation/ownership decision about the _feed_, not about who may
join a _discussion_ already happening on a visible post.

Commenting (reading and writing) keeps ADR 0030's original rule verbatim:
**any active member or alumnus**, independent of role. The single
`canAuthor()` predicate in `apps/web/app/_blog/access.ts` is split into:

- `canAuthorPost(me)` — the new, narrow, role-gated rule above.
- `canComment(me)` — ADR 0030's original rule, unchanged, renamed for
  clarity now that it no longer shares a name with the (now different)
  authoring rule.

This is an explicit, deliberate amendment of ADR 0033's coupling clause: the
two rights are allowed to drift apart from this point on, and future
changes to one must not be assumed to apply to the other.

## Consequences

- Most active members lose the ability to start a new post; they retain
  full read and comment access exactly as before.
- A member who already authored posts under the old rule keeps every post
  they already published — this is forward-only; nothing is retracted or
  hidden.
- `event_organizer` grants (a group's Event-Manager) now confer blog
  authoring in addition to event management, without any DB/schema change —
  the role value is unchanged, only its rights and its UI label
  ("Event-Manager" instead of "Organisator") change.
- The federation must actively grant `blogger` (or one of the other three
  qualifying roles) to anyone it wants writing on the blog going forward,
  including former frequent posters who hold no board role.
- `blogger` is a single-purpose role: it grants `canAuthorPost` and nothing
  else. It does not grant `canManageGroup`, `canGrantLocalRoles`,
  `canEditGroupPage`, file-manager write access, or event-organizer rights —
  those all check for specific other role values `blogger` does not carry.

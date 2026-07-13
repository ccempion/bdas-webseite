# Inbound group change requests on the local board's members dashboard

**Date:** 2026-07-13
**Extends:** ADR 0022 (group transfers are requests, decided by the destination board)
**Module:** `members` (existing, flagged, live). No new module, no new flag, no schema change.

## Problem

ADR 0022 shipped the write path: an active member files a transfer request and the
_destination_ group's board decides it. `decideGroupChange` correctly authorizes that
board, and `getGroupChangeHistory` correctly lets them read the applicant's timeline.

The read surface never landed. `/gruppe/[slug]/members` builds its table from
`listMembers(db, { groupId })`, which selects on `members.primary_group_id = groupId` —
the applicant still belongs to the group they are leaving, so no row renders for them.
`MemberGroupPanel`, which carries the Freigeben/Ablehnen buttons, is only mounted from a
table row. The destination board therefore has an inbound request it is authorized to
decide and no way to see or click it.

Outbound transfers are already visible: a member of _this_ group who applied elsewhere is
in the table and gets a `→ Berlin` badge in the Gruppe column.

## Decision

Surface inbound applicants as a distinct block **above** the members table, not as rows in
it. They are not (yet) members of this group; mixing them into the roster would make the
status filters, the row count and the "Gruppe" column ambiguous.

Clicking an applicant opens the **existing** aside (`MemberGroupPanel`), which already
renders the open request, the decide buttons and the group history. No second detail
component.

Scope is the group dashboard only. `/federal/members` lists every member in the
federation, so an applicant to a board-less group is already a row there and already
decidable through their member card. Nothing is missing there (CLAUDE.md §6).

## Module surface (`modules/members`)

One new read service in `services/group-change.ts`:

```ts
export type IncomingGroupChange = OpenGroupChange & { readonly member: Member };

export async function listIncomingGroupChanges(
  db: Db,
  toGroupId: string,
  actor: Actor,
): Promise<IncomingGroupChange[]>;
```

- Selects `member_group_change_requests` rows with `status = 'pending'` and
  `to_group_id = toGroupId`, **inner-joined** to `members` so the caller gets the
  applicant's name and status in one query (no N+1 over `getMember`).
- Newest request first.
- `canDecide` is computed exactly as in `listOpenGroupChanges`: `canDecideJoinRequest(
  actor.grants, toGroupId, await groupHasActiveLocalBoard(db, toGroupId))`. One probe —
  the destination is fixed. This preserves ADR 0021's federal fallback for a group with no
  active board seat.
- Visibility mirrors `listOpenGroupChanges`: returns `[]` unless the actor is federal
  board or manages `toGroupId`. It never throws; an unauthorized board simply sees an
  empty queue.
- The module still does not read the `groups` table (CLAUDE.md §1 rule 1). Group _names_
  are resolved by the page, which already calls `listGroups`.

Re-exported from `index.ts` (`listIncomingGroupChanges`, type `IncomingGroupChange`) and
documented in `modules/members/README.md`.

## Web surface (`apps/web/app/(board)`)

**`gruppe/[slug]/members/page.tsx`** — adds `listIncomingGroupChanges(db, groupId, actor)`
to its existing `Promise.all` and passes the result to `MembersTable`. `groupNames` is
already loaded there for the outbound badge and names the applicant's origin group.

**`_components/MembersTable.tsx`** — gains an optional `incoming?: IncomingGroupChange[]`
prop, defaulting to `[]` so `/federal/members` is untouched. When non-empty it renders,
above the filter toolbar:

```
┌─ Eingehende Wechselanträge (2) ──────────────┐
│ Cem Colak ›    Aachen → uns   12.07.  [✓][✗] │
│ Lena Weber ›   keine Gruppe   09.07.  [✓][✗] │
└──────────────────────────────────────────────┘
```

- Origin group name from `groupNames`, or "keine Gruppe" when `fromGroupId` is null.
- Freigeben / Ablehnen call the existing `decideGroupChangeAction(request.id, decision,
  revalidatePath)`. Authority is enforced server-side inside `decideGroupChange`; the
  buttons are a convenience, not the gate.
- When `canDecide` is false (the federal fallback does not apply and this board is not the
  destination's), the buttons are replaced by a muted note. In practice this cannot happen
  on a page scoped to the destination group, but the flag is honoured rather than assumed.
- Errors surface in the same error line the table already uses.
- Clicking the name sets the existing `selected` state to the applicant's `Member`, so the
  aside and `MemberGroupPanel` open unchanged.

Design tokens only — no inlined hex, radius, shadow or duration (CLAUDE.md §7). UI copy is
German.

## Tests

- `modules/members/src/group-change.test.ts` (integration, real Postgres):
  - the destination board sees the inbound request, hydrated with the applicant, with
    `canDecide: true`;
  - the origin board sees an empty inbound queue for its own group;
  - an unrelated board sees nothing;
  - federal board sees it and may decide when the destination has no board seat;
  - federal board sees it but `canDecide` is false when the destination has its own board;
  - a decided (non-pending) request drops out of the queue.

No web-layer test is added: the change to `MembersTable` is presentational and the
decision path it calls is already covered by the `decideGroupChange` suite.

## Non-goals

- Email notification to the destination board on a new request (ADR 0022 deferred it; the
  `members.group_change.requested` event is already published for a future subscriber).
- Board-initiated moves. A board acts by deciding requests.
- Any change to the federal members page.

# Inbound group change view — implementation plan

**Spec:** [`docs/superpowers/specs/2026-07-13-inbound-group-change-view-design.md`](../specs/2026-07-13-inbound-group-change-view-design.md)

**Goal:** A local board can see and decide the members of _other_ groups who have applied
to join theirs. Today those applicants are invisible on `/gruppe/[slug]/members` because
the table is built from `listMembers({ groupId })`, which matches on the member's _current_
group.

**Constraints:** no schema change, no new flag, no new module. Members module must not read
the `groups` table. Design tokens only. German copy. Tests ship with the code.

---

## Task 1 — `listIncomingGroupChanges` (members module)

**Files:**

- Modify: `modules/members/src/services/group-change.ts`
- Modify: `modules/members/src/types.ts`
- Modify: `modules/members/src/index.ts`
- Modify: `modules/members/README.md`
- Test: `modules/members/src/group-change.test.ts`

**Produces:** `IncomingGroupChange = OpenGroupChange & { member: Member }`,
`listIncomingGroupChanges(db, toGroupId, actor): Promise<IncomingGroupChange[]>`.

- [ ] **Step 1: Write the failing tests.** Append a `describeIfDb("listIncomingGroupChanges")`
      suite to `group-change.test.ts`, reusing the file's existing `FEDERAL`, `self`,
      `boardOf` and `giveBoardSeat` helpers plus a member of `grp_a` with an open request
      to `grp_b`:
  - destination board of `grp_b` sees one entry, `canDecide === true`, and
    `entry.member.firstName` is the applicant's;
  - the origin board of `grp_a` sees `[]` when querying its own group (the applicant is
    leaving, not arriving);
  - a board of an unrelated `grp_c` sees `[]` for `grp_b`;
  - federal board sees the entry with `canDecide === true` when `grp_b` has no board seat,
    and `canDecide === false` once `grp_b` has one;
  - an approved request no longer appears.

- [ ] **Step 2: Run them — expect FAIL** (`listIncomingGroupChanges is not a function`).
      `pnpm --filter @bdas/members test -- group-change`

- [ ] **Step 3: Add the type** to `types.ts`, next to `OpenGroupChange`:

  ```ts
  /** An open request into a group, hydrated with the member who filed it. */
  export type IncomingGroupChange = OpenGroupChange & { readonly member: Member };
  ```

- [ ] **Step 4: Implement the service** in `services/group-change.ts`, below
      `listOpenGroupChanges`. Inner-join `members` on `memberId`; filter
      `status = 'pending' AND to_group_id = toGroupId`; order by `requestedAt` desc.
      Return `[]` when `!isFederalBoard(actor.grants) && !canManageGroup(actor.grants, toGroupId)`.
      `canDecide` from `canDecideJoinRequest(actor.grants, toGroupId, await groupHasActiveLocalBoard(db, toGroupId))`.
      Map member rows with the existing `row2member`.

- [ ] **Step 5: Run the tests — expect PASS**, then the full module suite:
      `pnpm --filter @bdas/members test`

- [ ] **Step 6: Re-export** `listIncomingGroupChanges` and `type IncomingGroupChange` from
      `index.ts`; document the inbound queue in `modules/members/README.md`.

- [ ] **Step 7:** `pnpm --filter @bdas/members typecheck && pnpm lint`, then commit:
      `feat(members): listIncomingGroupChanges — the destination board's inbound queue`

---

## Task 2 — Inbound panel on the group members dashboard

**Files:**

- Modify: `apps/web/app/(board)/_components/MembersTable.tsx`
- Modify: `apps/web/app/(board)/gruppe/[slug]/members/page.tsx`

- [ ] **Step 1: Page.** Add `listIncomingGroupChanges(db, groupId, { userId: me.user.id, grants: me.grants })`
      to the existing `Promise.all` and pass it to `MembersTable` as `incoming`.

- [ ] **Step 2: Table.** Add `incoming?: IncomingGroupChange[]` (default `[]`). When
      non-empty, render above the filter toolbar a bordered block headed
      `Eingehende Wechselanträge (n)`, one row per applicant:
  - name as a button that sets `selected` to `c.member` (opens the existing aside);
  - `{origin} → uns`, origin from `groupNames[c.fromGroupId]` or `keine Gruppe`;
  - `seit {requestedAt}` formatted `de-DE`;
  - `Freigeben` / `Ablehnen` calling `decideGroupChangeAction(c.id, decision, revalidatePath)`
    inside the existing `start`/`setError` transition, when `c.canDecide`; otherwise a
    muted `Entscheidet ein anderer Vorstand.` note.
        Tokens only: `rounded-bdas`, `rounded-bdas-sm`, `rounded-bdas-pill`, `border-bdas-soft`,
        `bg-bdas-surface`, `bg-bdas-surface-hover`, `shadow-bdas-card`, `text-bdas-ink`,
        `text-bdas-ink-body`, `text-bdas-ink-muted`, `text-bdas-red`, `bg-bdas-red`.
        `/federal/members` passes no `incoming` and renders exactly as before.

- [ ] **Step 3:** `pnpm --filter @bdas/web typecheck && pnpm lint && pnpm format`, then commit:
      `feat(web): inbound transfer queue on the group members dashboard`

---

## Task 3 — Verify and merge

- [ ] Full test suite + typecheck across the workspace.
- [ ] Drive the flow against local Postgres: a member of group A applies to group B, then
      group B's board sees the applicant in the inbound queue, opens their card and
      approves; A's board never gets a decide button.
- [ ] Merge to `main`.

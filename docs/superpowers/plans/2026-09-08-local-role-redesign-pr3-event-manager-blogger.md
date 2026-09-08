# Local Role Redesign — PR3: Event-Manager relabel + Blogger + blog authoring restriction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relabel `event_organizer` to "Event-Manager" in the UI (no DB/behavior change to its event rights), introduce the new `blogger` role, and restrict blog **authoring** to Lead, Bundesvorstand, Event-Manager, and Blogger — while explicitly *not* touching who may **comment** on posts (still any active member or alumnus, per ADR 0030/0033's original rule).

**Architecture:** `apps/web/app/_blog/access.ts`'s `canAuthor()` is currently overloaded: it gates both "may write a new post" (`/blog/neu`, `createPostAction`) and "may write/read a comment" (`CommentsSection`, `createCommentAction`, the feed's comment-count query). ADR 0033 deliberately coupled these ("posting rights and commenting rights cannot drift apart") when both were the same rule. That coupling breaks now that posting gets a much narrower rule than commenting — restricting `canAuthor` outright would silently lock every ordinary active member out of commenting too, which nobody asked for and ADR 0033 never intended as a *consequence* of tightening authorship. This PR splits the one predicate into two: `canComment` (unchanged old rule) and `canAuthorPost` (new grant-based rule), and records the split as part of the new ADR.

**Tech Stack:** TypeScript, Vitest.

**Spec:** New ADR `docs/decisions/0034-local-role-redesign-blog-authoring.md` (Task 1 of this plan) — supersedes ADR 0030, amends the coupling clause of ADR 0033.

## Global Constraints

- **CLAUDE.md §4:** ADRs go in `docs/decisions/`, not chat/commit messages (Task 1). This PR changes authorization → needs `/security-review`.
- **Comments are explicitly out of scope for restriction** — `canComment`'s behavior must be byte-for-byte identical to today's `canAuthor` (active member or alumnus). Every task below that touches a comment call site is a *rename*, never a *behavior change*.
- Depends on PR1 (`blogger` must already be a legal `Role`/CHECK value) and does not depend on PR2.
- Do not touch the FAQ (`apps/web/content/faq/vorstand.ts`) — owned elsewhere, per this session's brief.
- Do not touch `modules/blog`'s own services (`createPost`, `visibility.ts`, `comments.ts`) — per that module's own doc comments, authorization is deliberately kept at the app layer (`apps/web/app/_blog/access.ts`) so the module itself stays free of an `@bdas/members` dependency (CLAUDE.md §1 rule 2). This PR only changes the app-layer gate.

---

### Task 1: Write the ADR

**Files:**
- Create: `docs/decisions/0034-local-role-redesign-blog-authoring.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR 0034: Local role redesign — blog authoring is now role-gated, not membership-gated

**Status:** Accepted
**Date:** 2026-09-08
**Supersedes:** ADR 0030 (blog authoring rights)
**Amends:** ADR 0033 (blog comments) — see "Comments are unaffected" below

## Context

This is one piece of a broader local-role redesign: the old flat `local_board`
role is retired (folded into `local_board_lead`, "Lead"), and two new
group-scoped delegate roles are introduced, `file_manager` ("Datei-Manager")
and `blogger` ("Blogger"). `event_organizer` ("Event-Manager" in the UI from
this point on) gains blog-authoring rights alongside its existing event
management rights.

ADR 0030 deliberately opened blog authoring to any active member or alumnus,
independent of any board role, as a considered reversal of the platform
spec's original "Local Board" role-table listing. The federation has now
reconsidered: blog authoring should be a delegated responsibility again, held
by people the federation or a group's Lead has explicitly trusted with it —
not a right every active member holds by default.

## Decision

Blog **authoring** (`createPost`) is now restricted to members holding one of:

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
post is a moderation/ownership decision about the *feed*, not about who may
join a *discussion* already happening on a visible post.

Commenting (reading and writing) keeps ADR 0030's original rule verbatim:
**any active member or alumnus**, independent of role. This PR splits the
single `canAuthor()` predicate in `apps/web/app/_blog/access.ts` into:

- `canAuthorPost(me)` — the new, narrow, role-gated rule above.
- `canComment(me)` — ADR 0030's original rule, unchanged, renamed for clarity
  now that it no longer shares a name with the (now different) authoring rule.

This is an explicit, deliberate amendment of ADR 0033's coupling clause: the
two rights are allowed to drift apart from this point on, and future changes
to one must not be assumed to apply to the other.

## Consequences

- Most active members lose the ability to start a new post; they retain full
  read and comment access exactly as before.
- A member who already authored posts under the old rule keeps every post
  they already published — this is forward-only; nothing is retracted or
  hidden.
- `event_organizer` grants (a group's Event-Manager) now confer blog authoring
  in addition to event management, without any DB/schema change — the role
  value is unchanged, only its rights and its UI label ("Event-Manager"
  instead of "Organisator") change.
- The federation must actively grant `blogger` (or one of the other three
  qualifying roles) to anyone it wants writing on the blog going forward,
  including former frequent posters who hold no board role.
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/0034-local-role-redesign-blog-authoring.md
git commit -m "docs: add ADR 0034 — restrict blog authoring to delegated roles, decouple from commenting

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 2: Split `canAuthor` into `canComment` and `canAuthorPost` in `apps/web/app/_blog/access.ts`

**Files:**
- Modify: `apps/web/app/_blog/access.ts`
- Modify: `apps/web/app/_blog/access.test.ts`

**Interfaces:**
- Produces: `canComment(me: CurrentMember | null): boolean` (renamed from `canAuthor`, same body), `canAuthorPost(me: CurrentMember | null): boolean` (new), `requirePostAuthor(): Promise<CurrentMember>` (same signature, now calls `canAuthorPost`).
- Removes: `canAuthor` (renamed away — every call site must move to one of the two new names; see Task 3/4).

- [ ] **Step 1: Write the failing tests**

Rewrite the `describe("canAuthor", ...)` block in `apps/web/app/_blog/access.test.ts` into two blocks. Keep every existing case (renamed to `canComment`, asserting the exact same behavior — this is the regression guard for "comments are unaffected"), and add a new block for `canAuthorPost`:

```typescript
import { canAuthorPost, canComment, resolveAuthor, resolveAuthors } from "./access";

// ... memberWithStatus helper unchanged ...

describe("canComment", () => {
  it("allows an active member", () => {
    expect(canComment(memberWithStatus("active"))).toBe(true);
  });

  it("allows an alumnus", () => {
    expect(canComment(memberWithStatus("alumnus"))).toBe(true);
  });

  it("rejects a pending member", () => {
    expect(canComment(memberWithStatus("pending"))).toBe(false);
  });

  it("rejects an inactive member", () => {
    expect(canComment(memberWithStatus("inactive"))).toBe(false);
  });

  it("rejects a signed-out visitor", () => {
    expect(canComment(null)).toBe(false);
  });

  it("rejects a signed-in user with no member profile yet", () => {
    const me: CurrentMember = {
      user: { id: "usr_2", email: "b@bdas.de", status: "active", roles: [], sessionId: "sess_2" },
      member: null,
      grants: [],
    };
    expect(canComment(me)).toBe(false);
  });
});

describe("canAuthorPost", () => {
  function memberWithGrants(grants: CurrentMember["grants"]): CurrentMember {
    return {
      user: { id: "usr_1", email: "a@bdas.de", status: "active", roles: [], sessionId: "sess_1" },
      member: {
        id: "mem_1",
        userId: "usr_1",
        firstName: "Ada",
        lastName: "Lovelace",
        primaryGroupId: "grp_a",
        status: "active",
        joinedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      grants,
    };
  }

  it("allows federal_board", () => {
    expect(canAuthorPost(memberWithGrants([{ role: "federal_board", groupId: null }]))).toBe(true);
  });

  it("allows local_board_lead (Lead)", () => {
    expect(
      canAuthorPost(memberWithGrants([{ role: "local_board_lead", groupId: "grp_a" }])),
    ).toBe(true);
  });

  it("allows event_organizer (Event-Manager)", () => {
    expect(
      canAuthorPost(memberWithGrants([{ role: "event_organizer", groupId: "grp_a" }])),
    ).toBe(true);
  });

  it("allows blogger", () => {
    expect(canAuthorPost(memberWithGrants([{ role: "blogger", groupId: "grp_a" }]))).toBe(true);
  });

  it("rejects an active member with no qualifying grant — the ADR 0030 default no longer applies", () => {
    expect(canAuthorPost(memberWithGrants([]))).toBe(false);
  });

  it("rejects an alumnus with no qualifying grant", () => {
    expect(canAuthorPost({ ...memberWithGrants([]), member: { ...memberWithGrants([]).member!, status: "alumnus" } })).toBe(false);
  });

  it("rejects file_manager and page_editor — neither is a blog-authoring role", () => {
    expect(canAuthorPost(memberWithGrants([{ role: "file_manager", groupId: "grp_a" }]))).toBe(false);
    expect(canAuthorPost(memberWithGrants([{ role: "page_editor", groupId: "grp_a" }]))).toBe(false);
  });

  it("rejects a signed-out visitor", () => {
    expect(canAuthorPost(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bdas/web test _blog/access`
Expected: FAIL — `canComment` and `canAuthorPost` don't exist yet (only `canAuthor` does).

- [ ] **Step 3: Update `access.ts`**

```typescript
// apps/web/app/_blog/access.ts — replace canAuthor with two predicates

/**
 * Eligible to COMMENT (read or write): an active member or an alumnus.
 * Pending (not yet confirmed by a Lead) and inactive accounts cannot
 * (ADR 0030's original rule, preserved verbatim for comments by ADR 0034 even
 * though blog *authoring* eligibility has since narrowed — see that ADR's
 * "Comments are unaffected" section).
 */
export function canComment(me: CurrentMember | null): boolean {
  return me !== null && (me.member?.status === "active" || me.member?.status === "alumnus");
}

const BLOG_AUTHOR_ROLES = new Set(["federal_board", "local_board_lead", "event_organizer", "blogger"]);

/**
 * Eligible to AUTHOR a new post: federal board, a group's Lead, an
 * Event-Manager, or a Blogger (ADR 0034 — supersedes ADR 0030's "any active
 * member or alumnus" default). Deliberately grant-based, not status-based:
 * holding one of these roles is itself the qualification.
 */
export function canAuthorPost(me: CurrentMember | null): boolean {
  if (me === null) return false;
  return me.grants.some((g) => BLOG_AUTHOR_ROLES.has(g.role));
}

/** Eligible to author a post, or redirect. */
export async function requirePostAuthor(): Promise<CurrentMember> {
  const me = await loadBlogMe();
  if (!me) redirect("/anmelden");
  if (!canAuthorPost(me)) redirect("/blog");
  return me;
}
```

Remove the old `canAuthor` function and its doc comment entirely — do not keep it as an alias, every call site is updated in Task 3/4.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @bdas/web test _blog/access`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_blog/access.ts apps/web/app/_blog/access.test.ts
git commit -m "feat(web): split blog canAuthor into canComment (unchanged) and canAuthorPost (role-gated, ADR 0034)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 3: Update comment call sites to `canComment` (no behavior change)

**Files:**
- Modify: `apps/web/app/blog/page.tsx`
- Modify: `apps/web/app/_blog/CommentsSection.tsx`
- Modify: `apps/web/app/blog/actions.ts`

**Interfaces:**
- Consumes: `canComment` from `../_blog/access` (renamed import, Task 2).

- [ ] **Step 1: `apps/web/app/blog/page.tsx`**

Line 10's import and line 50's usage — both currently `canAuthor` for the comment-count gate:

```tsx
import { canAuthorPost, loadBlogViewer, resolveAuthors } from "../_blog/access";
```

Wait — this file uses `canAuthor` for **two different purposes** on two different lines: line 50 (comment count — must become `canComment`) and line 64 (the "Neuer Beitrag" button — must become `canAuthorPost`). Import both:

```tsx
import { canAuthorPost, canComment, loadBlogViewer, resolveAuthors } from "../_blog/access";
```

Line 45-50 (comment count — comments are unaffected, use `canComment`):

```tsx
  // Mirrors CommentsSection's own gate (canComment): the count must be
  // members-and-alumni only, same as reading the comments themselves
  // (ADR 0033), not just the environment flag — so the query is skipped
  // entirely for a viewer who could never see a comment.
  const commentCounts =
    commentsEnabled() && canComment(me)
      ? await countCommentsByPost(
          db,
          posts.map((p) => p.id),
        )
      : new Map<string, number>();
```

Line 64 (the "Neuer Beitrag" link — this is authoring, use `canAuthorPost`):

```tsx
        {canAuthorPost(me) ? (
          <Link href="/blog/neu">
            <Button>Neuer Beitrag</Button>
          </Link>
        ) : null}
```

- [ ] **Step 2: `apps/web/app/_blog/CommentsSection.tsx`**

This component gates the entire comments region — that's a *comment* eligibility question, use `canComment`:

```tsx
import { blogViewer, canComment, resolveAuthors } from "./access";
```

```tsx
export async function CommentsSection({ post, me }: { post: Post; me: CurrentMember | null }) {
  if (!canComment(me)) return null;
```

Also update its doc comment (currently references `canAuthor`/ADR 0030 as the shared rule) to note it now uses `canComment` specifically, per ADR 0034.

- [ ] **Step 3: `apps/web/app/blog/actions.ts`**

`createCommentAction` (around line 186) is a comment action — use `canComment`:

```typescript
import { blogViewer, canAuthorPost, canComment, loadBlogMe } from "../_blog/access";
```

```typescript
/**
 * Add a comment. Eligibility is `canComment` — active member or alumnus,
 * unchanged by the ADR 0034 authoring restriction (see that ADR's "Comments
 * are unaffected" section).
 */
export async function createCommentAction(
  _prev: CommentFormState,
  fd: FormData,
): Promise<CommentFormState> {
  if (!commentsEnabled()) return { error: "Nicht verfügbar." };
  const me = await loadBlogMe();
  if (!me) return { error: "Anmeldung erforderlich." };
  if (!canComment(me)) {
    return { error: "Nur aktive Mitglieder oder Alumni dürfen kommentieren." };
  }
```

(`createPostAction`, in the same file, is Task 4's job — it needs `canAuthorPost`, not `canComment`. The import line above already includes both names since this file needs both.)

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: still shows an error for `createPostAction` (Task 4 fixes it) and `neu/page.tsx` (Task 4) — everything else should be clean. This step confirms Tasks 2-3 didn't break anything beyond the two known remaining call sites.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/blog/page.tsx apps/web/app/_blog/CommentsSection.tsx apps/web/app/blog/actions.ts
git commit -m "refactor(web): point comment call sites at canComment, not the old canAuthor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 4: Update post-authoring call sites to `canAuthorPost` (behavior change — this is the actual restriction)

**Files:**
- Modify: `apps/web/app/blog/actions.ts` (continues from Task 3 — same file, different function)
- Modify: `apps/web/app/blog/neu/page.tsx`

**Interfaces:**
- Consumes: `canAuthorPost`/`requirePostAuthor` from `../_blog/access`.

- [ ] **Step 1: `createPostAction` in `apps/web/app/blog/actions.ts`**

```typescript
/** Create a post. Eligible: federal board, Lead, Event-Manager, or Blogger (ADR 0034). */
export async function createPostAction(_prev: PostFormState, fd: FormData): Promise<PostFormState> {
  if (!isFlagOn("blog")) return { error: "Nicht verfügbar." };
  const me = await loadBlogMe();
  if (!me) return { error: "Anmeldung erforderlich." };
  if (!canAuthorPost(me)) {
    return {
      error: "Nur Bundesvorstand, Lead, Event-Manager oder Blogger dürfen Beiträge veröffentlichen.",
    };
  }
```

- [ ] **Step 2: `apps/web/app/blog/neu/page.tsx`**

This page calls `requirePostAuthor()`, which Task 2 already repointed at `canAuthorPost` internally — no change needed here beyond re-reading its inline comment (`// redirects to /anmelden if signed out, to /blog if signed in but ineligible`), which is still accurate as-is. Confirm no direct `canAuthor` import exists in this file (it shouldn't — it only calls `requirePostAuthor`).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean — this was the last remaining `canAuthor` reference.

- [ ] **Step 4: Confirm no `canAuthor` references remain anywhere**

Run: `grep -rn "canAuthor\b" apps/web` (word-boundary so `canAuthorPost` doesn't match)
Expected: no results.

- [ ] **Step 5: Run the full web test suite for the blog area**

Run: `pnpm --filter @bdas/web test blog`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run: `pnpm dev` with `BDAS_FLAG_BLOG=true`. As a plain active member (no board role), open `/blog` — confirm "Neuer Beitrag" is gone, and directly visiting `/blog/neu` redirects to `/blog`. Confirm the comment form and existing comments are still fully visible and postable (this is the regression check for "comments are unaffected"). As a federal board member (or a member with a `blogger`/`event_organizer`/`local_board_lead` grant), confirm "Neuer Beitrag" appears and posting works.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/blog/actions.ts apps/web/app/blog/neu/page.tsx
git commit -m "feat(web): restrict blog post authoring to Lead/federal/Event-Manager/Blogger (ADR 0034)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 5: Relabel Event-Manager, add Blogger to the grant UI

**Files:**
- Modify: `apps/web/app/(board)/_components/RoleRoster.tsx`
- Modify: `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx`

**Interfaces:**
- No new interfaces — content changes to existing UI. (No DB/role-value change for `event_organizer` — label only, per D6.)

- [ ] **Step 1: Relabel in `RoleRoster.tsx` and add `blogger`**

```typescript
const ROLE_LABEL: Record<string, string> = {
  federal_board: "Bundesvorstand",
  local_board_lead: "Lead",
  event_organizer: "Event-Manager",
  page_editor: "Seiten-Editor",
  file_manager: "Datei-Manager",
  blogger: "Blogger",
};
```

- [ ] **Step 2: Update `vorstand/page.tsx`'s grant options and sections**

(Final state, combining PR2's Datei-Manager addition with this task's relabel + Blogger addition:)

```tsx
        <GrantRoleModal
          title="Vorstand hinzufügen"
          candidates={groupMembers.map((m) => ({
            memberId: m.id,
            name: `${m.firstName} ${m.lastName}`,
          }))}
          roleOptions={[
            { role: "event_organizer", label: "Event-Manager", groupId },
            { role: "page_editor", label: "Seiten-Editor", groupId },
            { role: "file_manager", label: "Datei-Manager", groupId },
            { role: "blogger", label: "Blogger", groupId },
          ]}
          revalidatePath={revalidate}
        />
```

```tsx
        <RoleRoster
          sections={[
            { title: "Leads", holders: ofGroup.filter((h) => h.role === "local_board_lead") },
            {
              title: "Event-Manager",
              holders: ofGroup.filter((h) => h.role === "event_organizer"),
            },
            {
              title: "Seiten-Editoren",
              holders: ofGroup.filter((h) => h.role === "page_editor"),
            },
            {
              title: "Datei-Manager",
              holders: ofGroup.filter((h) => h.role === "file_manager"),
            },
            {
              title: "Blogger",
              holders: ofGroup.filter((h) => h.role === "blogger"),
            },
          ]}
          groupNames={{}}
          revalidatePath={revalidate}
          currentMemberId={me.member?.id ?? null}
          showGroupName={false}
        />
```

- [ ] **Step 3: Typecheck and build**

Run: `pnpm typecheck && pnpm --filter @bdas/web build`
Expected: no errors.

- [ ] **Step 4: Manual verification**

As a group Lead, open `/gruppe/<slug>/vorstand` — confirm the grant modal shows "Event-Manager" (not "Organisator") and a new "Blogger" option, and the roster shows five sections: Leads, Event-Manager, Seiten-Editoren, Datei-Manager, Blogger. Grant "Blogger" to a member, confirm they can now post to the blog (Task 4's check) and confirm they still cannot access anything else — no group management, no file write access, no page editing (spot-check at least one of these three to catch an accidental over-grant).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(board\)/_components/RoleRoster.tsx "apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx"
git commit -m "feat(web): relabel Event-Manager and add Blogger to the grant UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 6: `role-views.ts` doc comment + final repo-wide sanity sweep

**Files:**
- Modify: `modules/members/src/services/role-views.ts` (doc comment only — the `ROSTER_ROLES` array itself was already finalized in PR1 Task 5)

- [ ] **Step 1: Update the comment above `ROSTER_ROLES`**

```typescript
// Roles surfaced in the group roster + audit views. event_organizer is a
// group-scoped events delegate (ADR 0017) labelled "Event-Manager" in the UI
// since ADR 0034 (it also confers blog-authoring rights, app-layer only —
// see apps/web/app/_blog/access.ts). page_editor is a group-scoped
// page-content delegate (ADR 0026). file_manager and blogger are the two
// newest group-scoped delegates from the local role redesign.
```

- [ ] **Step 2: Confirm no other reference to "Organisator" as a role label remains**

Run: `grep -rn "Organisator" apps/web modules --include=*.ts --include=*.tsx`
Expected: no hits outside the FAQ (`apps/web/content/faq/vorstand.ts`, explicitly out of scope for this whole redesign, owned by ccempion) and any e2e test asserting the old label — if an e2e test asserts the literal string "Organisator" in the UI, update it to "Event-Manager" (do not touch anything under `apps/web/content/faq/`).

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: PASS repo-wide.

- [ ] **Step 4: Commit**

```bash
git add modules/members/src/services/role-views.ts
git commit -m "docs(members): note the Event-Manager relabel and its blog rights in role-views.ts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 7: `/security-review`

- [ ] **Step 1: Run `/security-review`** on the full PR3 diff. Focus areas: confirm `canAuthorPost` cannot be satisfied by `file_manager` or `page_editor` (Task 2's negative tests cover this — re-verify by reading `BLOG_AUTHOR_ROLES`'s final contents, not just the tests); confirm every comment-eligibility call site was moved to `canComment` and not accidentally left on (or moved to) `canAuthorPost` — a comment gate that's too narrow is a silent regression users will notice immediately, and it's easy to mix up the two renames across four call sites. Re-read Task 3's diff specifically for this.

## Self-Review

- **Spec coverage:** Event-Manager relabelled + blog rights added (Task 5, Task 4's `BLOG_AUTHOR_ROLES`), Blogger introduced and grantable (Task 5), blog authoring restricted to the four named roles (Task 2, Task 4), ADR recorded (Task 1), comments explicitly preserved (Task 2, 3). D1, D6 fully covered. ✓
- **Placeholder scan:** none. ✓
- **Type consistency:** `canAuthorPost`/`canComment` names introduced in Task 2 are used consistently through Tasks 3-4; `BLOG_AUTHOR_ROLES` set matches the four roles named in ADR 0034 exactly. ✓

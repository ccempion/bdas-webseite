# Blog Comments — Design

**Status:** Approved (brainstorm 2026-08-08)
**Module:** `@bdas/blog` (no new module)
**Supersedes:** nothing. Fills the `CommentsPlaceholder` seam left by
`docs/superpowers/specs/2026-07-26-blog-filtering-permissions-design.md`.

---

## 1. Context and decisions

The blog module shipped with comments deliberately deferred. What it left
behind is a mount point, not a stub to be rewritten:
`apps/web/app/_blog/CommentsPlaceholder.tsx` already enforces the visibility
rule decided for comments — external and signed-out visitors never see a
comments region, not even via a post's share link.

`post_reports` (migration `0002`) is a complete structural precedent for this
feature: a child table of `posts`, a rate-limited service, a typed event, an
email subscriber, and a moderation surface. Comments follow that shape.

Decisions taken during the brainstorm:

| Question         | Decision                                                          |
| ---------------- | ----------------------------------------------------------------- |
| Purpose          | Lightweight member discussion. Flat, no threading.                |
| Who may comment  | Active members **and alumni** — ADR 0030's authoring rule, reused |
| Body             | Plain text, 1–1000 characters. No rich text, no uploads.          |
| Moderation       | Comment author + federal board may delete. No comment reporting.  |
| Author email     | Deferred, not rejected (see §8).                                  |
| Feed count       | Yes — comment count on each `/blog` card.                         |
| Account deletion | Hard-delete the person's comments (see §5).                       |
| Where it lives   | Inside `@bdas/blog`. No generic comments module.                  |
| Visual treatment | Quiet thread: one card, hairline separators (see §6).             |

**Why inside `@bdas/blog`:** comments are a property of posts, and blog owns
posts (rule 1). A generic `@bdas/comments` module would buy reuse for which
there is no confirmed demand, at the cost of a module folder, README, flag,
migration namespace, and test harness — precisely the speculative abstraction
CLAUDE.md §6 rules out. If events or projects ever want comments, extracting
from a working implementation beats guessing the shape now.

---

## 2. Goals and non-goals

**Goals**

- Signed-in members and alumni can post and read short comments on a blog post.
- Guests and non-members never see the comments region.
- A comment can be removed by its author or by the federal board.
- The feed shows how many comments a post has.

**Non-goals** — out of scope, not to be re-litigated during implementation:

- Threading, replies, mentions.
- Editing a posted comment.
- Reactions or likes.
- Reporting a comment (the post-level report flow is untouched).
- Per-post enable/disable of comments.
- Rich text, images, attachments.
- Building account deletion itself (§5).

---

## 3. `modules/blog` changes

### Schema — migration `modules/blog/migrations/0003_comments.sql`

```sql
CREATE TABLE post_comments (
  id          text PRIMARY KEY,
  post_id     text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id   text NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT post_comments_body_length CHECK (char_length(body) BETWEEN 1 AND 1000)
);

CREATE INDEX post_comments_post_idx   ON post_comments(post_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX post_comments_author_idx ON post_comments(author_id, created_at);
```

`author_id` is a bare auth user id with no cross-module foreign key — the same
convention as `posts.created_by` and `post_reports.reporter_id`.

`deleted_at` is a moderation soft delete, matching posts: the row survives for
audit, and is excluded from every read path. Comments are flat, so a removed
comment leaves nothing dangling — it disappears entirely rather than leaving a
tombstone. This is distinct from erasure (§5), which removes rows outright.

The `post_comments_author_idx` index serves the rate-limit count and
`deleteCommentsByAuthor`.

Ids use `createId("cmnt")`, matching `createId("rprt")`.

### Types (`src/types.ts`)

```ts
export type Comment = {
  readonly id: string;
  readonly postId: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: Date;
};
```

### Visibility (`src/visibility.ts`)

Add one pure function, identical in shape to `canModeratePost` but keyed on the
comment's author:

```ts
export function canModerateComment(v: Viewer, c: { readonly authorId: string }): boolean;
```

Federal board, or the comment's own author. Eligibility to _write_ a comment is
**not** expressible here — it depends on member status (`alumnus`), which
`Viewer` does not carry — so it stays an app-layer check (§4).

### Services (`src/services/comments.ts`)

```ts
addComment(db, postId, viewer, body): Promise<Comment>
listComments(db, postId): Promise<Comment[]>
deleteComment(db, commentId, viewer): Promise<void>
countCommentsByPost(db, postIds): Promise<Map<string, number>>
deleteCommentsByAuthor(db, authorId): Promise<number>
```

- **`addComment`** — the author is `viewer.userId`, **not** a separate
  argument: passing both a `Viewer` and an `authorId` would allow the two to
  disagree. A `null` `userId` throws `ForbiddenError`. Then: post exists and is
  not soft-deleted (`NotFoundError`);
  `canViewPost(viewer, post)` holds (`NotFoundError`, not `ForbiddenError` — a
  post the viewer may not see must not be revealed to exist); body trims to
  1–1000 characters (`ValidationError`); rate limit not exceeded
  (`RateLimitError`). Then insert and publish (§ events).
- **`listComments`** — oldest first, `deleted_at IS NULL`. Takes no `Viewer`:
  the caller has already resolved the post through the visibility-gated
  `getPostBySlug`, so re-checking here would be theatre.
- **`deleteComment`** — loads the comment, applies `canModerateComment`
  (`ForbiddenError`), sets `deleted_at`. `NotFoundError` if absent or already
  deleted.
- **`countCommentsByPost`** — one grouped query over a list of post ids,
  returning a Map. Excludes deleted comments. Used by the feed so N cards cost
  one query, not N.
- **`deleteCommentsByAuthor`** — hard `DELETE`, returns the row count. Exists
  solely as the seam account deletion will call (§5).

**Rate limit:** mirrors `report.ts` — a rolling 24-hour window per author,
enforced by a count query before insert. Limit: **20 comments per 24 hours**
(reports use 10; commenting is a more frequent act, so the ceiling is higher
while still bounding a flood).

**One deliberate divergence from `report.ts`:** `addComment` takes a `Viewer`
and applies `canViewPost` itself. `reportPost` leaves that check to
`reportPostAction` (`apps/web/app/blog/actions.ts:138`), which does perform it
correctly — this is defence in depth for a write path that will grow more
callers, not a fix for an existing hole. `reportPost` is not touched.

### Events (`src/events.ts`)

```ts
export type CommentCreated = {
  readonly type: "blog.comment.created";
  readonly postId: string;
  readonly commentId: string;
  readonly authorId: string;
  readonly at: Date;
};
```

Added to the `BlogEvent` union and published by `addComment`. **It has no
subscriber today** — the author-notification email is deferred (§8). It is
included anyway because module convention (CLAUDE.md §3) is that modules emit
typed events for cross-module reactions, and the deferred notification is the
known consumer. This is the one piece of the design with no consumer on merge.

### Public surface (`src/index.ts`)

Re-export the five services, the `Comment` type, `canModerateComment`, and the
`CommentCreated` event type. Nothing else becomes visible.

---

## 4. App surface (`apps/web`)

### Server actions (`app/blog/actions.ts`)

Both follow the file's existing shape: flag guard → principal → validate →
service → `revalidatePath`, with errors funnelled through `appErr`.

- **`createCommentAction(prev, fd)`** — `isFlagOn("blog")` and the comments
  sub-flag (§7); `loadBlogMe()`; `canAuthor(me)` with the same German copy as
  `createPostAction` ("Nur aktive Mitglieder oder Alumni dürfen …"); loads the
  post by id — needed for its slug, to revalidate the right path — then calls
  `addComment` with `blogViewer(me)`, which re-checks visibility itself. Revalidates
  `/blog/${slug}` **and** `/blog`, since the feed count changed.
- **`deleteCommentAction(prev, fd)`** — mirrors `deletePostAction` via a small
  `assertCommentModerable(commentId)` helper alongside the existing
  `assertModerable`. Revalidates the same two paths.

### Components (`app/_blog/`)

- **`CommentsSection.tsx`** (server) replaces `CommentsPlaceholder.tsx`.
  Renders nothing unless `canAuthor(me)` — the same "guests never see this
  region" rule as the placeholder, widened from active-only to active-plus-
  alumni so that everyone who may write may also read. Calls `listComments`,
  then `resolveAuthors` **once** for the whole list, so N comments cost one
  lookup per unique author.
- **`CommentForm.tsx`** (client) — `<textarea>`, live character counter against
  the 1000 cap, disabled while submitting, inline error line. Uses
  `useFormState` + `useFormStatus` from `react-dom`, the idiom every existing
  blog client component uses.
- **`DeleteCommentButton.tsx`** (client) — near-copy of `DeletePostButton.tsx`.

### Pages

- **`app/blog/[slug]/page.tsx`** — swap `CommentsPlaceholder` for
  `CommentsSection`; the gate expression changes from `viewer.isMember` to
  `canAuthor(me)`.
- **`app/blog/page.tsx`** — render "N Kommentare" on each feed card, fed by
  `countCommentsByPost`.

### Eligibility, stated once

Commenting reuses **`canAuthor(me)` verbatim** (active member or alumnus,
ADR 0030). One helper governs posting and commenting so the two cannot drift
apart. A `pending` or `inactive` account can neither write nor read comments.

---

## 5. Account deletion

**Account deletion does not exist in this platform today.** There is no
`deleteAccount`, no `auth.user.deleted` event, and nothing that removes an
`auth_users` row. The closest existing concept is a membership exit, which only
transitions status to `inactive` (`modules/members/src/roles.ts:117`) and
leaves every row in place.

This spec therefore builds **the seam, not the feature**:
`deleteCommentsByAuthor(db, authorId)` is exported from `@bdas/blog`. Whoever
builds account deletion calls that one function and never touches
`post_comments` directly, keeping rule 1 intact.

Erasure is a **hard delete**, not a soft delete: a comment body is personal
data, and soft-deleting would retain exactly what erasure is meant to remove.

**Explicitly deferred to its own ADR and phase:** the real right-to-erasure
story almost certainly spans posts, profile photos, uploaded files, and event
registrations. Deleting a person's comments while leaving their posts would be
incoherent, and folding that scope into a comments spec would hide it. Noted
here so the gap is on the record.

The display layer already degrades gracefully: `resolveAuthor` falls back to
"BDAS-Mitglied" when no member row is found, so content orphaned by a future
deletion renders unattributed rather than crashing.

---

## 6. Visual treatment

Chosen from three mockups during the brainstorm: **quiet thread**.

One `Card flat` holds the whole section. Comments are separated by hairline
borders (`border-bdas-soft`) and whitespace, **not** by nested cards — a card
around a one-sentence comment reads as clutter, and nesting cards inside the
page's card makes the two fight. Each row: a 36px initials chip or profile
photo (`AuthorAvatar`), name in `text-bdas-ink`, timestamp in
`text-bdas-ink-muted`, body in `text-bdas-ink-body`. The composer sits below a
top hairline; its submit button is the only brand-red element in the region.

Rejected: a card per comment (too heavy, nests cards); chat bubbles (imports
the WhatsApp idiom, which the platform spec's non-goals deliberately keep as a
separate channel).

Timestamps use the existing `formatDate` from `apps/web/lib/format.ts`, the
same helper the feed cards use. (`formatDateTime` is `dateStyle: "full"` —
"Freitag, 8. August 2026 um 14:30" — far too long to sit inline next to a
name.) The mockup showed relative times ("vor 2 Stunden"); there is no
relative-time helper in the codebase, and adding one is not worth its own
tests here.

Empty state: "Noch keine Kommentare." above the composer, so the region never
looks broken.

All values come from `core/design-system` tokens — no inline hex, radius,
shadow, or duration (CLAUDE.md §7).

---

## 7. Feature flag and rollout

Comments ride the existing `blog` module but get their own sub-flag,
**`BDAS_FLAG_BLOG_COMMENTS`**, off by default.

The `blog` flag is already on in production, so without a sub-flag, merging
this would switch comments on for the entire federation the moment it deploys —
before the ADR (§9) has been ratified. The sub-flag costs roughly four lines
and makes go-live a deliberate act.

**Deployment note — this has bitten the project before:** Vercel deploys do not
run the migration runner. `0003_comments.sql` must be applied to the production
database by hand and recorded in `_bdas_migrations`, or the post page fails on
first render with "relation post_comments does not exist".

---

## 8. Deferred: author notification

The post author is **not** emailed when someone comments. Recorded as deferred,
not rejected.

**Risk, stated plainly:** with no email and no in-app notification, a comment on
an older post will likely go unseen, which is the usual way a comment feature
ends up feeling dead. The feed comment count (§4) is a partial mitigation — it
is what makes a member click in.

If built later, it is a second PR touching `@bdas/notifications` (one
subscriber on `blog.comment.created`, one template, one `NotificationKind`),
kept separate because CLAUDE.md §4 is one module per PR.

---

## 9. ADR

**ADR 0032 — Blog comments**, to be written with the implementation. Records:

- Comments exist despite `docs/bdas-platform-spec.md` §3's non-goal "Internal
  social-network features (DMs, feeds, comments)". This is the same override
  pattern ADR 0030 used for authoring rights, and the same one under which the
  blog itself exists at all (the non-goal list also excludes a blog).
- Scope: flat, member-and-alumni only, plain text.
- Eligibility inherited from ADR 0030 rather than redefined.
- Moderation limited to comment author plus federal board; no comment reporting.

---

## 10. Testing

Per CLAUDE.md §4, tests ship in the same PR.

- **`modules/blog/src/comments.test.ts`** — integration against real Postgres
  via `createTestDb`, matching `index.test.ts`. `0003_comments.sql` is appended
  to the explicit migration list at `index.test.ts:58`. Cases: add/list/delete
  round trip; rate limit trips at the 21st comment in a window; body length
  bounds (empty, 1001 chars); `canViewPost` rejection for a board-only post;
  soft-deleted comments excluded from list and count; comments on a
  soft-deleted post excluded; `deleteCommentsByAuthor` removes rows outright
  and returns the count; `blog.comment.created` published once per add.
- **`modules/blog/src/visibility.test.ts`** — pure cases for
  `canModerateComment`: author yes, federal yes, other member no, anon no.
- **`apps/web/app/_blog/access.test.ts`** — an alumnus may comment; a `pending`
  member may not.
- **`e2e/`** — extend the existing `test.describe("blog", …)`: a member
  comments, sees it, deletes it; a signed-out visitor sees no comments region.
  (The §23 acceptance job is not branch-protected but does catch blog-flow
  regressions — check it when this lands.)

No database mocks anywhere in the above.

---

## 11. Delivery

One PR: roughly 550 lines across 14 files, about half of them near-copies of
existing patterns (`report.ts`, `DeletePostButton`, `PostForm`).

Follow-ups, each its own PR and out of scope here:

1. Author-notification email (§8).
2. Account deletion / right to erasure across all modules (§5).

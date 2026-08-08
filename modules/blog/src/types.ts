/**
 * Domain types for the blog module's public surface. The DB row shape
 * (`PostRow`) is internal — service callers see `Post` / `PostSummary`.
 *
 * A post's body is stored as Tiptap/ProseMirror JSON (`TiptapDoc`), the same
 * content shape the events module uses. The app renders it to sanitized HTML
 * via `renderPostContentHtml` so the editor never ships to visitors.
 */

/** ProseMirror document root, as emitted by the Tiptap editor. */
export type TiptapDoc = { readonly type: "doc"; readonly content?: ReadonlyArray<unknown> };

/**
 * Audience of a post. Enforced server-side (see `visibility.ts`):
 *   - `public`  — everyone, including signed-out external visitors,
 *   - `members` — signed-in members only,
 *   - `board`   — federal board only ("Nur Vorstände").
 */
export type PostVisibility = "public" | "members" | "board";

/**
 * A post's fixed topical category (spec 2026-07-26), chosen by the author at
 * publish time. One category per post — not free-form tags.
 */
export type PostCategory =
  | "verbandsintern"
  | "gruppenleben"
  | "veranstaltungsrueckblick"
  | "politik_positionen"
  | "karriere_weiterbildung"
  | "sonstiges";

/** German display labels, in the fixed order shown in selects/filter chips. */
export const CATEGORY_LABELS: Record<PostCategory, string> = {
  verbandsintern: "Verbandsintern",
  gruppenleben: "Gruppenleben",
  veranstaltungsrueckblick: "Veranstaltungsrückblick",
  politik_positionen: "Politik & Positionen",
  karriere_weiterbildung: "Karriere & Weiterbildung",
  sonstiges: "Sonstiges",
};

export type Post = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly content: TiptapDoc;
  readonly visibility: PostVisibility;
  readonly category: PostCategory;
  /** Auth user id of the author (no FK, matches events). */
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/** Feed row — same fields as `Post`; the feed renders the full body inline. */
export type PostSummary = Post;

/** A report's review state: open (awaiting board review) or dismissed. */
export type PostReportStatus = "open" | "dismissed";

/** One member's report against a post, hydrated with the post's title/slug for the moderation queue. */
export type PostReport = {
  readonly id: string;
  readonly postId: string;
  readonly postTitle: string;
  readonly postSlug: string;
  readonly reporterId: string;
  readonly reason: string | null;
  readonly status: PostReportStatus;
  readonly createdAt: Date;
};

/** One member's comment on a post. Flat — comments never reference each other. */
export type Comment = {
  readonly id: string;
  readonly postId: string;
  /** Auth user id of the commenter (no FK, matches `Post.createdBy`). */
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: Date;
};

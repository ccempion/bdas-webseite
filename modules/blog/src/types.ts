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

export type Post = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly content: TiptapDoc;
  readonly visibility: PostVisibility;
  /** Auth user id of the author (no FK, matches events). */
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/** Feed row — same fields as `Post`; the feed renders the full body inline. */
export type PostSummary = Post;

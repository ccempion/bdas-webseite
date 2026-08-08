import { canModerateComment, listComments, type Post } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import type { CurrentMember } from "@bdas/members";

import { blogViewer, canAuthor, resolveAuthors } from "./access";
import { AuthorAvatar } from "./AuthorAvatar";
import { CommentForm } from "./CommentForm";
import { DeleteCommentButton } from "./DeleteCommentButton";
import { formatDate } from "../../lib/format";

/**
 * Member discussion under a post. Renders nothing at all for guests and
 * non-members — a post's share link must never expose the comments region
 * (blog spec 2026-07-26, requirement 5). Eligibility to read matches
 * eligibility to write: active member or alumnus (ADR 0030, reused by 0033).
 */
export async function CommentsSection({ post, me }: { post: Post; me: CurrentMember | null }) {
  if (!canAuthor(me)) return null;

  const comments = await listComments(getDb(), post.id);
  const authors = await resolveAuthors(
    comments.map((c) => c.authorId),
    true,
  );
  const viewer = blogViewer(me);

  return (
    <Card flat className="p-6">
      <h2 className="text-lg font-semibold text-bdas-ink">Kommentare</h2>
      <p className="mt-1 text-sm text-bdas-ink-muted">
        {comments.length === 0
          ? "Noch keine Kommentare."
          : `${comments.length} ${comments.length === 1 ? "Kommentar" : "Kommentare"}`}
      </p>

      {comments.length > 0 ? (
        <ul className="mt-4 flex flex-col">
          {comments.map((c) => {
            const author = authors.get(c.authorId);
            return (
              <li key={c.id} className="flex gap-3 border-b border-bdas-soft py-4 last:border-b-0">
                <AuthorAvatar
                  initials={author?.initials ?? "?"}
                  name={author?.name ?? "BDAS-Mitglied"}
                  photoUrl={author?.photoUrl ?? null}
                  size={36}
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-bdas-ink">
                      {author?.name ?? "BDAS-Mitglied"}
                    </span>
                    <span className="text-bdas-ink-muted">{formatDate(c.createdAt)}</span>
                    {canModerateComment(viewer, c) ? (
                      <DeleteCommentButton commentId={c.id} slug={post.slug} />
                    ) : null}
                  </p>
                  {/* Plain text: preserve the author's line breaks, never render HTML. */}
                  <p className="whitespace-pre-wrap break-words text-sm text-bdas-ink-body">
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <CommentForm postId={post.id} />
    </Card>
  );
}

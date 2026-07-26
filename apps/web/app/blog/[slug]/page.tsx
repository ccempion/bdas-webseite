import Link from "next/link";
import { notFound } from "next/navigation";

import { getPostBySlug, renderPostContentHtml } from "@bdas/blog";
import { getDb } from "@bdas/db";

import { requireBlogFlag } from "../../_blog/flag";
import { CommentsPlaceholder } from "../../_blog/CommentsPlaceholder";
import { canModerate, loadBlogViewer, resolveAuthor } from "../../_blog/access";
import { DeletePostButton } from "../../_blog/DeletePostButton";
import { ReportPostButton } from "../../_blog/ReportPostButton";
import { formatDate } from "../../../lib/format";

export const metadata = { title: "Beitrag" };

const VISIBILITY_LABEL: Record<string, string> = {
  public: "Öffentlich",
  members: "Nur Mitglieder",
  board: "Nur Vorstände",
};

export default async function PostPage({ params }: { params: { slug: string } }) {
  requireBlogFlag();

  const db = getDb();
  const { me, viewer } = await loadBlogViewer();
  // Same visibility rule as the feed: a post the viewer may not see 404s, so a
  // "Nur Vorstände" post is never revealed to externals via its share link.
  const post = await getPostBySlug(db, params.slug, viewer);
  if (!post) notFound();

  const author = await resolveAuthor(post.createdBy);
  const html = renderPostContentHtml(post.content);
  const mayModerate = canModerate(me, post);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-bdas-ink-muted">
          {formatDate(post.createdAt)}
          {post.visibility !== "public" ? ` · ${VISIBILITY_LABEL[post.visibility]}` : ""}
        </p>
        <h1 className="text-3xl font-semibold text-bdas-ink">{post.title}</h1>
      </header>

      <article
        className="prose max-w-none text-bdas-ink-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Single view shows the author by NAME only (no avatar), at the bottom. */}
      <footer className="flex items-center justify-between border-t border-bdas-soft pt-4">
        <p className="text-sm text-bdas-ink-muted">
          Von <span className="text-bdas-ink-body">{author.name}</span>
        </p>
        {mayModerate ? (
          <div className="flex items-center gap-3 text-sm">
            <Link href={`/blog/${post.slug}/bearbeiten`} className="text-bdas-red hover:underline">
              Bearbeiten
            </Link>
            <DeletePostButton postId={post.id} />
          </div>
        ) : null}
      </footer>

      {me && me.user.id !== post.createdBy ? <ReportPostButton postId={post.id} /> : null}

      {/* Comments are member-only; guests never see this region (requirement 5). */}
      <CommentsPlaceholder canSeeComments={viewer.isMember} />
    </main>
  );
}

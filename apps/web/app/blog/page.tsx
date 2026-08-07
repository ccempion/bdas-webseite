import Link from "next/link";

import type { ListPostsFilters } from "@bdas/blog";
import { CATEGORY_LABELS, listPosts, renderPostContentHtml } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { Alert, Button, Card } from "@bdas/design-system";

import { requireBlogFlag } from "../_blog/flag";
import { AuthorAvatar } from "../_blog/AuthorAvatar";
import { canAuthor, loadBlogViewer, resolveAuthors } from "../_blog/access";
import { BlogFilterBar } from "../_blog/BlogFilterBar";
import { parseCategory, parseZeitraum, resolveSince } from "../_blog/filters";
import { formatDate } from "../../lib/format";

export const metadata = { title: "Blog" };

const VISIBILITY_LABEL: Record<string, string> = {
  public: "Öffentlich",
  members: "Nur Mitglieder",
  board: "Nur Vorstände",
};

export default async function BlogFeedPage({
  searchParams,
}: {
  searchParams: { kategorie?: string; zeitraum?: string };
}) {
  requireBlogFlag();

  const category = parseCategory(searchParams.kategorie);
  const zeitraum = parseZeitraum(searchParams.zeitraum);
  const since = resolveSince(zeitraum);

  const db = getDb();
  const { me, viewer } = await loadBlogViewer();
  const filters: ListPostsFilters = {
    ...(category !== undefined && { category }),
    ...(since !== undefined && { since }),
  };
  const posts = await listPosts(db, viewer, filters);
  const authors = await resolveAuthors(
    posts.map((p) => p.createdBy),
    me !== null,
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold text-bdas-ink">Blog</h1>
          <p className="text-bdas-ink-body">Beiträge aus dem BDAS.</p>
        </div>
        {canAuthor(me) ? (
          <Link href="/blog/neu">
            <Button>Neuer Beitrag</Button>
          </Link>
        ) : null}
      </header>

      <BlogFilterBar category={category} zeitraum={zeitraum} />

      {posts.length === 0 ? (
        <Alert variant="info" title="Keine Beiträge gefunden">
          Für diese Auswahl gibt es aktuell keine Beiträge.
        </Alert>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2">
          {posts.map((p) => {
            const author = authors.get(p.createdBy);
            const html = renderPostContentHtml(p.content);
            return (
              <li key={p.id}>
                <Card className="flex h-full flex-col p-6">
                  <div className="flex items-center gap-3">
                    <AuthorAvatar
                      initials={author?.initials ?? "?"}
                      name={author?.name ?? "BDAS-Mitglied"}
                      photoUrl={author?.photoUrl ?? null}
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold text-bdas-ink">
                        {author?.name ?? "BDAS-Mitglied"}
                      </span>
                      <span className="text-sm text-bdas-ink-muted">
                        {formatDate(p.createdAt)} · {CATEGORY_LABELS[p.category]}
                        {p.visibility !== "public" ? ` · ${VISIBILITY_LABEL[p.visibility]}` : ""}
                      </span>
                    </div>
                  </div>

                  <Link href={`/blog/${p.slug}`} className="mt-4 block focus:outline-none">
                    <h2 className="text-xl font-semibold text-bdas-ink hover:text-bdas-red">
                      {p.title}
                    </h2>
                  </Link>

                  <div
                    className="prose mt-2 max-w-none text-bdas-ink-body"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />

                  <Link
                    href={`/blog/${p.slug}`}
                    className="mt-auto self-start pt-4 text-sm text-bdas-red hover:underline"
                  >
                    Beitrag öffnen
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

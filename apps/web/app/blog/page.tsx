import Link from "next/link";

import { listPosts, renderPostContentHtml } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { Alert, Button, Card } from "@bdas/design-system";

import { requireBlogFlag } from "../_blog/flag";
import { InitialsAvatar } from "../_blog/InitialsAvatar";
import { loadBlogViewer, resolveAuthors } from "../_blog/access";
import { formatDate } from "../../lib/format";

export const metadata = { title: "Blog" };

const VISIBILITY_LABEL: Record<string, string> = {
  public: "Öffentlich",
  members: "Nur Mitglieder",
  board: "Nur Vorstände",
};

export default async function BlogFeedPage() {
  requireBlogFlag();

  const db = getDb();
  const { me, viewer } = await loadBlogViewer();
  const posts = await listPosts(db, viewer);
  const authors = await resolveAuthors(posts.map((p) => p.createdBy));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold text-bdas-ink">Blog</h1>
          <p className="text-bdas-ink-body">Beiträge aus dem BDAS.</p>
        </div>
        {me ? (
          <Link href="/blog/neu">
            <Button>Neuer Beitrag</Button>
          </Link>
        ) : null}
      </header>

      {posts.length === 0 ? (
        <Alert variant="info" title="Noch keine Beiträge">
          Hier erscheinen Beiträge, sobald welche veröffentlicht wurden.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-6">
          {posts.map((p) => {
            const author = authors.get(p.createdBy);
            const html = renderPostContentHtml(p.content);
            return (
              <li key={p.id}>
                <Card className="p-6">
                  <div className="flex items-center gap-3">
                    <InitialsAvatar initials={author?.initials ?? "?"} />
                    <div className="flex flex-col">
                      <span className="font-semibold text-bdas-ink">
                        {author?.name ?? "BDAS-Mitglied"}
                      </span>
                      <span className="text-sm text-bdas-ink-muted">
                        {formatDate(p.createdAt)}
                        {p.visibility !== "public"
                          ? ` · ${VISIBILITY_LABEL[p.visibility]}`
                          : ""}
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
                    className="mt-4 inline-block text-sm text-bdas-red hover:underline"
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

import { notFound, redirect } from "next/navigation";

import { getPostBySlug } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";

import { requireBlogFlag } from "../../../_blog/flag";
import { canModerate, loadBlogViewer } from "../../../_blog/access";
import { PostForm } from "../../../_blog/PostForm";

export const metadata = { title: "Beitrag bearbeiten" };

export default async function EditPostPage({ params }: { params: { slug: string } }) {
  requireBlogFlag();

  const db = getDb();
  const { me, viewer } = await loadBlogViewer();
  const post = await getPostBySlug(db, params.slug, viewer);
  if (!post) notFound();
  if (!canModerate(me, post)) redirect(`/blog/${post.slug}`);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Beitrag bearbeiten</h1>
      <Card flat className="p-6">
        <PostForm
          post={{
            id: post.id,
            title: post.title,
            content: post.content,
            visibility: post.visibility,
          }}
        />
      </Card>
    </main>
  );
}

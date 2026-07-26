import { Card } from "@bdas/design-system";

import { requireBlogFlag } from "../../_blog/flag";
import { requirePostAuthor } from "../../_blog/access";
import { PostForm } from "../../_blog/PostForm";

export const metadata = { title: "Neuer Beitrag" };

export default async function NewPostPage() {
  requireBlogFlag();
  await requirePostAuthor(); // redirects to /anmelden if signed out, to /blog if signed in but ineligible

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Neuer Beitrag</h1>
      <Card flat className="p-6">
        <PostForm />
      </Card>
    </main>
  );
}

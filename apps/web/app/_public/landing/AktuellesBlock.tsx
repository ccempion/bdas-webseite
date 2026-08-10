import Link from "next/link";

import { ANON, listPosts } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { Card, Section } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";

import { toAktuellesItem, type AktuellesItem } from "./aktuelles";

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" });

function NewsCard({ item }: { item: AktuellesItem }) {
  return (
    <Link href={item.href} className="group block focus-visible:outline-none">
      <Card className="h-full p-5">
        <p className="text-sm text-bdas-ink-muted">{dateFmt.format(item.publishedAt)}</p>
        <h3 className="mb-2 mt-1 font-semibold text-bdas-ink transition-colors duration-bdas-soft ease-bdas group-hover:text-bdas-red group-focus-visible:text-bdas-red">
          {item.title}
        </h3>
        <p className="text-sm text-bdas-ink-body">{item.teaser}</p>
      </Card>
    </Link>
  );
}

export async function AktuellesBlock() {
  if (!isFlagOn("blog")) return null;

  // ANON — same viewer the blog feed uses for signed-out visitors. The public
  // landing page must never surface `members`/`board`-only posts; the filter
  // runs server-side in `listPosts`, not in this component.
  const posts = await listPosts(getDb(), ANON);
  const items = posts.slice(0, 3).map(toAktuellesItem);
  if (items.length === 0) return null;

  return (
    <Section
      title="Aktuelles"
      action={
        <Link href="/blog" className="text-bdas-red hover:underline">
          Zum Blog →
        </Link>
      }
    >
      <ul className="grid gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <NewsCard item={item} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

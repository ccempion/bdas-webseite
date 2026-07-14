import Link from "next/link";

import { Card, Section } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";

import { placeholderNewsSource, type NewsItem } from "../news";

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" });

function NewsCard({ item }: { item: NewsItem }) {
  const body = (
    <Card className="h-full p-5">
      <p className="text-sm text-bdas-ink-muted">{dateFmt.format(item.publishedAt)}</p>
      <h3 className="mb-2 mt-1 font-semibold text-bdas-ink">{item.title}</h3>
      <p className="text-sm text-bdas-ink-body">{item.teaser}</p>
    </Card>
  );
  return item.href ? (
    <Link href={item.href} className="block focus:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

export async function AktuellesBlock() {
  const items = await placeholderNewsSource.listLatest(3);
  if (items.length === 0) return null;

  return (
    <Section
      title="Aktuelles"
      action={
        isFlagOn("blog") ? (
          <Link href="/blog" className="text-bdas-red hover:underline">
            Zum Blog →
          </Link>
        ) : null
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

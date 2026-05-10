import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { getGroupBySlug } from "@bdas/groups";

import { requireGroupsFlag } from "../../_groups/flag.js";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<{ title: string }> {
  return { title: `Hochschulgruppe ${params.slug}` };
}

export default async function GruppeDetailPage({ params }: { params: { slug: string } }) {
  requireGroupsFlag();

  const group = await getGroupBySlug(getDb(), params.slug);
  if (!group) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <p className="text-sm text-bdas-ink-muted">
        <Link href="/gruppen" className="hover:underline">
          ← Alle Hochschulgruppen
        </Link>
      </p>

      <header className="flex flex-col gap-1">
        <p className="text-sm text-bdas-ink-muted">{group.city}</p>
        <h1 className="text-3xl font-semibold text-bdas-ink">{group.name}</h1>
        {group.university ? <p className="text-bdas-ink-body">{group.university}</p> : null}
      </header>

      {group.status === "dormant" ? (
        <Alert variant="info" title="Inaktive Gruppe">
          Diese Hochschulgruppe ist derzeit nicht aktiv.
        </Alert>
      ) : null}

      {group.description ? (
        <Card flat className="p-6">
          <p className="whitespace-pre-line text-bdas-ink-body leading-relaxed">
            {group.description}
          </p>
        </Card>
      ) : null}

      <Card className="p-6">
        <h2 className="mb-3 text-lg font-semibold text-bdas-ink">Kontakt</h2>
        <ul className="flex flex-col gap-2 text-bdas-ink-body">
          {group.contactEmail ? (
            <li>
              <span className="text-bdas-ink-muted">E-Mail:</span>{" "}
              <a href={`mailto:${group.contactEmail}`} className="text-bdas-red hover:underline">
                {group.contactEmail}
              </a>
            </li>
          ) : null}
          {group.instagramUrl ? (
            <li>
              <span className="text-bdas-ink-muted">Instagram:</span>{" "}
              <a
                href={group.instagramUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-bdas-red hover:underline"
              >
                {group.instagramUrl.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            </li>
          ) : null}
          {group.websiteUrl ? (
            <li>
              <span className="text-bdas-ink-muted">Website:</span>{" "}
              <a
                href={group.websiteUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-bdas-red hover:underline"
              >
                {group.websiteUrl}
              </a>
            </li>
          ) : null}
          {!group.contactEmail && !group.instagramUrl && !group.websiteUrl ? (
            <li className="text-bdas-ink-muted">Kontaktdaten folgen.</li>
          ) : null}
        </ul>
      </Card>
    </main>
  );
}

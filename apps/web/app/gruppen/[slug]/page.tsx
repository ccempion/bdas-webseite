import Link from "next/link";
import { notFound } from "next/navigation";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { listUpcomingEvents } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { getGroupBySlug } from "@bdas/groups";
import { canEditGroupPage } from "@bdas/members";

import { puckConfig } from "../../_content/puck-config";
import { loadCurrentMember } from "../../_dashboard/session";
import { requireGroupsFlag } from "../../_groups/flag";
import { viewerFrom } from "../../../lib/event-viewer";
import { formatDateTime } from "../../../lib/format";

export const dynamic = "force-dynamic";

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
  if (!group || group.status === "archived") notFound();

  const contentOn = isFlagOn("content");
  const me = await loadCurrentMember();
  const canEdit = contentOn && me !== null && canEditGroupPage(me.grants, group.id);
  const page = contentOn ? await getPage(getDb(), `gruppen/${group.slug}`) : null;
  const upcoming = isFlagOn("events")
    ? await listUpcomingEvents(getDb(), viewerFrom(me), { groupId: group.id })
    : [];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <p className="text-sm text-bdas-ink-muted">
        <Link href="/gruppen" className="hover:underline">
          ← Alle Hochschulgruppen
        </Link>
      </p>

      <header className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-bdas-ink-muted">{group.city}</p>
          <h1 className="text-3xl font-semibold text-bdas-ink">{group.name}</h1>
        </div>
        {canEdit ? (
          <Link
            href={`/gruppen/${group.slug}/bearbeiten`}
            className="inline-flex shrink-0 items-center rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
          >
            Seite bearbeiten
          </Link>
        ) : null}
      </header>

      {group.status === "dormant" ? (
        <Alert variant="info" title="Inaktive Gruppe">
          Diese Hochschulgruppe ist derzeit nicht aktiv.
        </Alert>
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

      {page ? <Render config={puckConfig} data={page.data as Data} /> : null}

      {upcoming.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-bdas-ink">Kommende Events</h2>
          {upcoming.map((e) => (
            <Link key={e.id} href={`/events/${e.id}`} className="block focus:outline-none">
              <Card className="p-5">
                <p className="text-sm text-bdas-ink-muted">{formatDateTime(e.startsAt)}</p>
                <h3 className="mt-1 text-lg font-semibold text-bdas-ink">{e.title}</h3>
                {e.location ? (
                  <p className="mt-1 text-sm text-bdas-ink-body">{e.location}</p>
                ) : null}
              </Card>
            </Link>
          ))}
        </section>
      ) : null}
    </main>
  );
}

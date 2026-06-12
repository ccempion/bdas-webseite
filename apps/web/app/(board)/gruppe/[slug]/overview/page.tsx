import { getDb } from "@bdas/db";
import { listManagedEvents } from "@bdas/events-module";
import { countMembersByStatus, signupsOverTime } from "@bdas/members";

import { requireGroupScope } from "../../../../_dashboard/session";
import { viewerFrom } from "../../../../../lib/event-viewer";
import { ActionStrip } from "../../../_components/ActionStrip";
import { Sparkline } from "../../../_components/Sparkline";
import { Tile } from "../../../_components/Tile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Übersicht" };

export default async function GroupOverviewPage({ params }: { params: { slug: string } }) {
  const { me, groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  const [counts, signups, events] = await Promise.all([
    countMembersByStatus(db, { groupId }),
    signupsOverTime(db, { groupId, days: 30 }),
    listManagedEvents(db, viewerFrom(me)),
  ]);
  const groupEvents = events.filter((e) => e.groupId === groupId);
  const upcoming = groupEvents.filter((e) => e.status === "published" && e.startsAt > new Date()).length;
  const newSignups = signups.reduce((n, p) => n + p.count, 0);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-bdas-ink">Übersicht</h1>
      <ActionStrip items={[{ count: counts.pending, label: "Freigaben", href: `/gruppe/${params.slug}/members` }]} />
      <div className="flex flex-wrap gap-3">
        <Tile value={String(counts.active)} label="Aktive Mitglieder" />
        <Tile value={`+${newSignups}`} label="Neu (30 T.)" />
        <Tile value={String(upcoming)} label="Anstehende Events" />
      </div>
      <Sparkline points={signups} label="Anmeldungen (30 Tage)" />
    </section>
  );
}

import { getDb } from "@bdas/db";
import { listManagedEvents } from "@bdas/events-module";
import { listGroups } from "@bdas/groups";
import { countMembersByStatus, getCurrentMember, signupsOverTime } from "@bdas/members";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../lib/event-viewer";
import { ActionStrip } from "../../_components/ActionStrip";
import { Sparkline } from "../../_components/Sparkline";
import { Tile } from "../../_components/Tile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Übersicht" };

export default async function FederalOverviewPage() {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const [counts, signups, groups, events] = await Promise.all([
    countMembersByStatus(db, {}),
    signupsOverTime(db, { days: 30 }),
    listGroups(db, { status: "active" }),
    listManagedEvents(db, viewerFrom(me)),
  ]);
  const newSignups = signups.reduce((n, p) => n + p.count, 0);
  const upcoming = events.filter((e) => e.status === "published" && e.startsAt > new Date()).length;

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-bdas-ink">Übersicht · Bundesverband</h1>
      <ActionStrip
        items={[{ count: counts.pending, label: "Freigaben", href: "/federal/members" }]}
      />
      <div className="flex flex-wrap gap-3">
        <Tile value={String(counts.active)} label="Aktive Mitglieder" />
        <Tile value={`+${newSignups}`} label="Neu (30 T.)" />
        <Tile value={String(groups.length)} label="Gruppen aktiv" />
        <Tile value={String(upcoming)} label="Anstehende Events" />
      </div>
      <Sparkline points={signups} label="Anmeldungen (30 Tage)" />
    </section>
  );
}

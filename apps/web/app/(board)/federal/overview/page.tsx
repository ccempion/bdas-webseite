import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { countMembersByStatus, signupsOverTime } from "@bdas/members";

import { ActionStrip } from "../../_components/ActionStrip";
import { Sparkline } from "../../_components/Sparkline";
import { Tile } from "../../_components/Tile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Übersicht" };

export default async function FederalOverviewPage() {
  const db = getDb();
  const [counts, signups, groups] = await Promise.all([
    countMembersByStatus(db, {}),
    signupsOverTime(db, { days: 30 }),
    listGroups(db, { status: "active" }),
  ]);
  const newSignups = signups.reduce((n, p) => n + p.count, 0);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-bdas-ink">Übersicht · Bundesverband</h1>
      <ActionStrip items={[{ count: counts.pending, label: "Freigaben", href: "/federal/members" }]} />
      <div className="flex flex-wrap gap-3">
        <Tile value={String(counts.active)} label="Aktive Mitglieder" />
        <Tile value={`+${newSignups}`} label="Neu (30 T.)" />
        <Tile value={String(groups.length)} label="Gruppen aktiv" />
      </div>
      <Sparkline points={signups} label="Anmeldungen (30 Tage)" />
    </section>
  );
}

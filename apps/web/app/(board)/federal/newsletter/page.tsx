import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { listMembers } from "@bdas/members";
import { countSubscribers, listSubscribers } from "@bdas/newsletter";

import { requireNewsletterFlag } from "../../../_newsletter/flag";
import { requireFederalScope } from "../../../_dashboard/session";
import { Tile } from "../../_components/Tile";
import { SubscriberTable } from "./SubscriberTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter" };

export default async function FederalNewsletterPage() {
  requireNewsletterFlag();
  await requireFederalScope();

  const db = getDb();
  // Tiles and table come out of the same pipeline (`listSubscribers` and
  // `countSubscribers` both run `loadDeduped`), so they cannot contradict each
  // other the way four separate COUNT(*) would.
  const [rows, counts, members, groups] = await Promise.all([
    listSubscribers(db, {}),
    countSubscribers(db),
    listMembers(db, {}),
    listGroups(db),
  ]);

  // The person's CURRENT group, not the row's `groupId` — that field records
  // where a signup came from (spec §4) and nothing writes it yet. Resolved
  // here rather than in the module so `modules/newsletter` keeps no dependency
  // on `modules/members` (rule 1).
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const groupNames = Object.fromEntries(
    members.flatMap((m) => {
      const name = m.primaryGroupId === null ? undefined : groupNameById.get(m.primaryGroupId);
      return name === undefined ? [] : [[m.userId, name] as const];
    }),
  );

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-bdas-ink">Newsletter</h1>
      <div className="flex flex-wrap gap-3">
        <Tile value={String(counts.subscribed)} label="Abonniert" />
        <Tile value={String(counts.pending)} label="Ausstehend" />
        <Tile value={String(counts.unsubscribed)} label="Abgemeldet" />
        <Tile value={String(counts.declined)} label="Abgelehnt" />
      </div>
      <SubscriberTable rows={rows} groupNames={groupNames} />
    </section>
  );
}

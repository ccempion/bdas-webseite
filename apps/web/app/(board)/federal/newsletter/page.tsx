import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { listMembers } from "@bdas/members";
import { countSubscribers, listSubscribers } from "@bdas/newsletter";

import { groupNamesByUserId } from "../../../../lib/member-groups";
import { bootNewsletter } from "../../../../lib/newsletter-bootstrap";
import { requireFederalScope } from "../../../_dashboard/session";
import { requireNewsletterFlag } from "../../../_newsletter/flag";
import { Tile } from "../../_components/Tile";
import { SubscriberTable } from "./SubscriberTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter" };

export default async function FederalNewsletterPage() {
  requireNewsletterFlag();
  await requireFederalScope();
  // Wires the account-email resolver: `instrumentation.ts` is bundled apart
  // from this route, so without it every address would silently fall back to
  // the stored duplicate key.
  bootNewsletter();

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

  const groupNames = Object.fromEntries(groupNamesByUserId(members, groups));

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

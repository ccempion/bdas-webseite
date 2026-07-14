import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { requireEventsFlag } from "../../../_events/flag";
import { readSessionCookie } from "../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../lib/event-viewer";
import { EventForm } from "../EventForm";

export const metadata = { title: "Neue Veranstaltung" };

export default async function NewEventPage() {
  requireEventsFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");
  const viewer = viewerFrom(me);
  if (
    !viewer.isFederal &&
    viewer.boardGroupIds.length === 0 &&
    viewer.organizerGroupIds.length === 0
  ) {
    redirect("/account");
  }

  const allGroups = await listGroups(db, { status: "active" });
  const manageGroupIds = new Set([...viewer.boardGroupIds, ...viewer.organizerGroupIds]);
  const groups = viewer.isFederal ? allGroups : allGroups.filter((g) => manageGroupIds.has(g.id));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Neue Veranstaltung</h1>
      <Card flat className="p-6">
        <EventForm
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          allowFederation={viewer.isFederal}
        />
      </Card>
    </main>
  );
}

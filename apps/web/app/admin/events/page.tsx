import Link from "next/link";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Alert, Button, Card } from "@bdas/design-system";
import { listManagedEvents } from "@bdas/events-module";
import { getCurrentMember } from "@bdas/members";

import { requireEventsFlag } from "../../_events/flag";
import { readSessionCookie } from "../../../lib/auth-cookie";
import { viewerFrom } from "../../../lib/event-viewer";
import { formatDateTime } from "../../../lib/format";

export const metadata = { title: "Veranstaltungen verwalten" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf",
  published: "Veröffentlicht",
  cancelled: "Abgesagt",
};

export default async function AdminEventsPage() {
  requireEventsFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");
  const viewer = viewerFrom(me);
  if (!viewer.isFederal && viewer.boardGroupIds.length === 0) redirect("/account");

  const events = await listManagedEvents(db, viewer);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-bdas-ink">Veranstaltungen verwalten</h1>
        <Link href="/admin/events/neu">
          <Button>Neue Veranstaltung</Button>
        </Link>
      </header>

      {events.length === 0 ? (
        <Alert variant="info" title="Keine Veranstaltungen">
          Lege deine erste Veranstaltung an.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/admin/events/${e.id}`} className="block focus:outline-none">
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-bdas-ink-muted">{formatDateTime(e.startsAt)}</p>
                      <h2 className="text-lg font-semibold text-bdas-ink">{e.title}</h2>
                    </div>
                    <span className="text-sm text-bdas-ink-body">
                      {STATUS_LABEL[e.status]} ·{" "}
                      {e.capacity === null
                        ? `${e.confirmedCount} angemeldet`
                        : `${e.confirmedCount}/${e.capacity}`}
                    </span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

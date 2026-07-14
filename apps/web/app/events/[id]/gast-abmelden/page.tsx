import Link from "next/link";

import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import { ANON, getEvent } from "@bdas/events-module";

import { requireEventsFlag } from "../../../_events/flag";
import { formatDateTime } from "../../../../lib/format";
import { GuestCancelForm } from "./GuestCancelForm";

export const metadata = { title: "Von Veranstaltung abmelden" };

export default async function GuestCancelPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { token?: string };
}) {
  requireEventsFlag();

  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  // Public read only, to show the title on the confirmation step. The token —
  // not the session — authorizes the actual cancellation.
  const event = await getEvent(getDb(), params.id, ANON);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Von Veranstaltung abmelden</h1>
      <Card flat className="p-6">
        {!token ? (
          <p className="text-sm text-bdas-ink-body">Dieser Abmeldelink ist ungültig.</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-bdas-ink-body">
              {event
                ? `Möchtest du deine Anmeldung für „${event.title}“ am ${formatDateTime(
                    event.startsAt,
                  )} wirklich stornieren?`
                : "Möchtest du deine Anmeldung wirklich stornieren?"}
            </p>
            <GuestCancelForm eventId={params.id} token={token} />
          </>
        )}
      </Card>
      <Link href={`/events/${params.id}`} className="text-sm text-bdas-red hover:underline">
        ← Zur Veranstaltung
      </Link>
    </main>
  );
}

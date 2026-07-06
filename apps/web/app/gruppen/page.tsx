import Link from "next/link";

import { listGroups } from "@bdas/groups";
import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";

import { requireGroupsFlag } from "../_groups/flag";
import { GroupMapLazy } from "../_groups/GroupMapLazy";
import { toPins } from "../_groups/pins";

export const metadata = { title: "Hochschulgruppen" };

export default async function GruppenPage() {
  requireGroupsFlag();

  const groups = await listGroups(getDb(), { status: "active" });
  const pins = isFlagOn("group_map") ? toPins(groups) : [];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-bdas-ink">Hochschulgruppen</h1>
        <p className="text-bdas-ink-body">Die Hochschulgruppen des BDAS — wähle deine Stadt aus.</p>
      </header>

      {pins.length > 0 ? <GroupMapLazy pins={pins} /> : null}

      {groups.length === 0 ? (
        <Alert variant="info" title="Noch keine Gruppen sichtbar">
          Wir tragen die Hochschulgruppen schrittweise ein. Schau bald wieder vorbei.
        </Alert>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/gruppen/${g.slug}`} className="block focus:outline-none">
                <Card className="p-5">
                  <p className="text-sm text-bdas-ink-muted">{g.city}</p>
                  <h2 className="mt-1 text-lg font-semibold text-bdas-ink">{g.name}</h2>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

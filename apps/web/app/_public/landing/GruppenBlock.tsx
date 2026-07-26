import Link from "next/link";

import { getDb } from "@bdas/db";
import { Card, Section } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";
import { listGroups } from "@bdas/groups";

import { GroupMapLazy } from "../../_groups/GroupMapLazy";
import { toPins } from "../../_groups/pins";

const MAX_CARDS = 8;

export async function GruppenBlock() {
  const groups = await listGroups(getDb(), { status: "active" });
  const pins = isFlagOn("group_map") ? toPins(groups) : [];
  const shown = groups.slice(0, MAX_CARDS);

  return (
    <Section
      id="gruppen"
      title={`Vor Ort an ${groups.length} Hochschulen`}
      intro="Finde die BDAS-Gruppe an deiner Hochschule."
      action={
        <Link href="/gruppen" className="text-bdas-red hover:underline">
          Alle Gruppen →
        </Link>
      }
    >
      {pins.length > 0 ? (
        <GroupMapLazy pins={pins} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((g) => (
            <li key={g.id}>
              <Link href={`/gruppen/${g.slug}`} className="group block focus-visible:outline-none">
                <Card className="h-full p-4">
                  <h3 className="font-semibold text-bdas-ink transition-colors duration-bdas-soft ease-bdas group-hover:text-bdas-red group-focus-visible:text-bdas-red">
                    {g.name}
                  </h3>
                  <p className="text-sm text-bdas-ink-muted">{g.city}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

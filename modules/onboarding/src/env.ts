import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getGroupBySlug, listGroups } from "@bdas/groups";

import type { FlowEnv } from "./types";

export type Db = PostgresJsDatabase<Record<string, never>>;

/** Die Zeilen, die `infra/seeds/groups.json` anlegt. */
export const BDAJ_SLUG = "bdaj";
export const NETZWERK_SLUG = "netzwerk";

/**
 * Die Laufzeitlage für `nextStep`. Drei Abfragen nacheinander statt parallel:
 * der Pool hat wenige Verbindungen, und dieser Aufruf liegt auf dem
 * Registrierungsweg.
 */
export async function loadFlowEnv(db: Db): Promise<FlowEnv> {
  const groups = await listGroups(db, { status: "active", kind: "hochschulgruppe" });
  const bdaj = await getGroupBySlug(db, BDAJ_SLUG);
  const netzwerk = await getGroupBySlug(db, NETZWERK_SLUG);

  return {
    groups: groups.flatMap((g) => (g.city ? [{ id: g.id, name: g.name, city: g.city }] : [])),
    bdajGroupId: bdaj?.kind === "affiliate" && bdaj.status === "active" ? bdaj.id : null,
    netzwerkGroupId:
      netzwerk?.kind === "netzwerk" && netzwerk.status === "active" ? netzwerk.id : null,
  };
}

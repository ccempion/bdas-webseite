import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { listMembers } from "@bdas/members";

import { MembersTable } from "../../_components/MembersTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mitglieder" };

export default async function FederalMembersPage() {
  const db = getDb();
  const [members, groups] = await Promise.all([listMembers(db, {}), listGroups(db)]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Mitglieder</h1>
      <MembersTable members={members} groupNames={groupNames} revalidatePath="/federal/members" />
    </section>
  );
}

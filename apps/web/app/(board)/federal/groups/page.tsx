import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";

import { CreateGroupForm } from "../../_components/CreateGroupForm";
import { GroupsTable } from "../../_components/GroupsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gruppen" };

export default async function FederalGroupsPage() {
  const groups = await listGroups(getDb());
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Gruppen</h1>
      <CreateGroupForm />
      <GroupsTable groups={groups} />
    </section>
  );
}

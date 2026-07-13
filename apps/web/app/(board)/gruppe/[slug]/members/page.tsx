import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { listMembers, listOpenGroupChanges } from "@bdas/members";

import { requireGroupScope } from "../../../../_dashboard/session";
import { MembersTable } from "../../../_components/MembersTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mitglieder" };

export default async function GroupMembersPage({ params }: { params: { slug: string } }) {
  const { me, groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  // All group names, not just this one: the member card must be able to name the
  // destination of a pending transfer, which is by definition another group.
  const [members, groups, openChanges] = await Promise.all([
    listMembers(db, { groupId }),
    listGroups(db),
    listOpenGroupChanges(db, { userId: me.user.id, grants: me.grants }),
  ]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Mitglieder</h1>
      <MembersTable
        members={members}
        groupNames={groupNames}
        openChanges={openChanges}
        revalidatePath={`/gruppe/${params.slug}/members`}
      />
    </section>
  );
}

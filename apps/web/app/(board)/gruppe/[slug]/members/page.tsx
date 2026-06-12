import { getDb } from "@bdas/db";
import { getGroupBySlug } from "@bdas/groups";
import { listMembers } from "@bdas/members";

import { requireGroupScope } from "../../../../_dashboard/session";
import { MembersTable } from "../../../_components/MembersTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mitglieder" };

export default async function GroupMembersPage({ params }: { params: { slug: string } }) {
  const { groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  const [members, group] = await Promise.all([listMembers(db, { groupId }), getGroupBySlug(db, params.slug)]);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Mitglieder</h1>
      <MembersTable
        members={members}
        groupNames={group ? { [group.id]: group.name } : {}}
        revalidatePath={`/gruppe/${params.slug}/members`}
      />
    </section>
  );
}

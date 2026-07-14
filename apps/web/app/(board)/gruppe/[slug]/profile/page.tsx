import { getDb } from "@bdas/db";
import { getGroupBySlug } from "@bdas/groups";

import { requireGroupScope } from "../../../../_dashboard/session";
import { GroupProfileForm } from "../../../_components/GroupProfileForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil" };

export default async function GroupProfilePage({ params }: { params: { slug: string } }) {
  const { groupId } = await requireGroupScope(params.slug);
  const group = await getGroupBySlug(getDb(), params.slug);
  if (!group) return null;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Profil</h1>
      <GroupProfileForm
        groupId={groupId}
        initial={{ name: group.name, city: group.city, location: group.location }}
        revalidatePath={`/gruppe/${params.slug}/profile`}
      />
    </section>
  );
}

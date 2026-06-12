import { getDb } from "@bdas/db";
import { listGrantAudit, listMembers, listRoleHolders } from "@bdas/members";

import { requireLeadScope } from "../../../../_dashboard/session";
import { AuditLog } from "../../../_components/AuditLog";
import { GrantRoleModal } from "../../../_components/GrantRoleModal";
import { RoleRoster } from "../../../_components/RoleRoster";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vorstand" };

export default async function VorstandPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { me, groupId } = await requireLeadScope(params.slug);
  const db = getDb();
  const [holders, audit, groupMembers] = await Promise.all([
    listRoleHolders(db),
    listGrantAudit(db, { groupId }),
    listMembers(db, { groupId, status: "active" }),
  ]);
  const ofGroup = holders.filter((h) => h.groupId === groupId);
  const revalidate = `/gruppe/${params.slug}/vorstand`;
  const tab = searchParams["tab"];
  const showAudit = tab === "audit";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-bdas-ink">Vorstand</h1>
        <GrantRoleModal
          title="Vorstand hinzufügen"
          candidates={groupMembers.map((m) => ({
            memberId: m.id,
            name: `${m.firstName} ${m.lastName}`,
          }))}
          roleOptions={[{ role: "local_board", label: "Vorstand", groupId }]}
          revalidatePath={revalidate}
        />
      </div>
      <nav className="flex gap-2 text-sm">
        <a
          href={revalidate}
          className={!showAudit ? "font-bold text-bdas-red" : "text-bdas-ink-body"}
        >
          Vorstand
        </a>
        <a
          href={`${revalidate}?tab=audit`}
          className={showAudit ? "font-bold text-bdas-red" : "text-bdas-ink-body"}
        >
          Audit-Log
        </a>
      </nav>
      {showAudit ? (
        <AuditLog entries={audit} groupNames={{}} />
      ) : (
        <RoleRoster
          sections={[
            { title: "Leads", holders: ofGroup.filter((h) => h.role === "local_board_lead") },
            { title: "Vorstand", holders: ofGroup.filter((h) => h.role === "local_board") },
          ]}
          groupNames={{}}
          revalidatePath={revalidate}
          currentMemberId={me.member?.id ?? null}
        />
      )}
    </section>
  );
}

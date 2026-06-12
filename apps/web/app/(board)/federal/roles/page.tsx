import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { getCurrentMember, listGrantAudit, listMembers, listRoleHolders } from "@bdas/members";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { AuditLog } from "../../_components/AuditLog";
import { GrantRoleModal, type RoleOption } from "../../_components/GrantRoleModal";
import { RoleRoster } from "../../_components/RoleRoster";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rollen & Vorstände" };

export default async function FederalRolesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const [holders, audit, groups, activeMembers] = await Promise.all([
    listRoleHolders(db),
    listGrantAudit(db, {}),
    listGroups(db),
    listMembers(db, { status: "active" }),
  ]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  const tab = searchParams["tab"];
  const showAudit = tab === "audit";

  const roleOptions: RoleOption[] = [
    { role: "federal_board", label: "Bundesvorstand", groupId: null, needsTypedConfirm: true },
    ...groups
      .filter((g) => g.status === "active")
      .map((g) => ({ role: "local_board_lead", label: `Lead · ${g.name}`, groupId: g.id })),
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-bdas-ink">Rollen &amp; Vorstände</h1>
        <GrantRoleModal
          title="Rolle erteilen"
          candidates={activeMembers.map((m) => ({ memberId: m.id, name: `${m.firstName} ${m.lastName}` }))}
          roleOptions={roleOptions}
          revalidatePath="/federal/roles"
        />
      </div>
      <nav className="flex gap-2 text-sm">
        <a href="/federal/roles" className={!showAudit ? "font-bold text-bdas-red" : "text-bdas-ink-body"}>Inhaber</a>
        <a href="/federal/roles?tab=audit" className={showAudit ? "font-bold text-bdas-red" : "text-bdas-ink-body"}>Audit-Log</a>
      </nav>
      {showAudit ? (
        <AuditLog entries={audit} groupNames={groupNames} />
      ) : (
        <RoleRoster
          sections={[
            { title: "Bundesvorstand", holders: holders.filter((h) => h.role === "federal_board") },
            { title: "Lokale Vorstands-Leads", holders: holders.filter((h) => h.role === "local_board_lead") },
            { title: "Lokale Vorstände", holders: holders.filter((h) => h.role === "local_board") },
          ]}
          groupNames={groupNames}
          revalidatePath="/federal/roles"
          currentMemberId={me?.member?.id ?? null}
        />
      )}
    </section>
  );
}

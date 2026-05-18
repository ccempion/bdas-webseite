import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { ForbiddenError } from "@bdas/errors";
import { Alert, Card } from "@bdas/design-system";
import { getGroupBySlug } from "@bdas/groups";
import { canManageGroup, getCurrentMember, isFederalBoard } from "@bdas/members";

import { requireAuthFlag } from "../../../../_auth/flag";
import { requireGroupsFlag } from "../../../../_groups/flag";
import { requireMembersFlag } from "../../../../_members/flag";
import { readSessionCookie } from "../../../../../lib/auth-cookie";
import { ArchiveButton } from "../../ArchiveButton";
import { GroupForm } from "../../GroupForm";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<{ title: string }> {
  return { title: `Gruppe bearbeiten — ${params.slug}` };
}

export default async function GruppeBearbeitenPage({ params }: { params: { slug: string } }) {
  requireAuthFlag();
  requireMembersFlag();
  requireGroupsFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");

  const group = await getGroupBySlug(db, params.slug);
  if (!group) notFound();

  // Federal board → any group; local board → only its own (ADR 0007).
  if (!canManageGroup(me.grants, group.id)) {
    throw new ForbiddenError("Du darfst diese Gruppe nicht bearbeiten.");
  }

  const isArchived = group.status === "archived";
  const canArchive = isFederalBoard(me.grants);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <p className="text-sm text-bdas-ink-muted">
        <Link href="/admin/gruppen" className="hover:underline">
          ← Zurück zur Übersicht
        </Link>
      </p>
      <h1 className="text-2xl font-semibold text-bdas-ink">{group.name} bearbeiten</h1>

      {isArchived ? (
        <Alert variant="info" title="Archivierte Gruppe">
          Diese Gruppe ist archiviert und auf der öffentlichen Seite nicht sichtbar. Setze den
          Status auf „Aktiv“ und speichere, um sie wieder zu veröffentlichen.
        </Alert>
      ) : null}

      <GroupForm
        groupId={group.id}
        initial={{
          slug: group.slug,
          name: group.name,
          city: group.city,
          contactEmail: group.contactEmail ?? "",
          instagramUrl: group.instagramUrl ?? "",
          websiteUrl: group.websiteUrl ?? "",
          status: group.status,
        }}
      />

      {!isArchived && canArchive ? (
        <Card className="flex flex-col gap-3 p-5">
          <div>
            <h2 className="text-lg font-semibold text-bdas-ink">Gruppe archivieren</h2>
            <p className="text-sm text-bdas-ink-muted">
              Archivierte Gruppen verschwinden von der öffentlichen Seite, bleiben aber erhalten.
            </p>
          </div>
          <ArchiveButton groupId={group.id} groupName={group.name} />
        </Card>
      ) : null}
    </main>
  );
}

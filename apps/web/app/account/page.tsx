import Link from "next/link";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Alert, Button, Card } from "@bdas/design-system";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { requireAuthFlag } from "../_auth/flag";
import { requireMembersFlag } from "../_members/flag";
import { readSessionCookie } from "../../lib/auth-cookie";
import { ProfileForm } from "./ProfileForm";

export const metadata = { title: "Mein Konto" };

const STATUS_LABEL: Record<string, string> = {
  pending: "Warte auf Freigabe durch den Bundesvorstand.",
  active: "Aktives Mitglied.",
  inactive: "Inaktiv.",
  alumnus: "Alumnus.",
};

export default async function AccountPage() {
  requireAuthFlag();
  requireMembersFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");

  const groups = await listGroups(db, { status: "active" });

  const isBoard = me.effectiveRoles.includes("federal_board");
  const status = me.member?.status;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-bdas-ink">Mein Konto</h1>
        <p className="text-bdas-ink-body">{me.user.email}</p>
      </header>

      {status === "pending" ? (
        <Alert variant="info" title="Profil eingereicht">
          {STATUS_LABEL["pending"]}
        </Alert>
      ) : null}

      {status === "active" ? (
        <Alert variant="success" title="Mitgliedschaft aktiv">
          {STATUS_LABEL["active"]}
        </Alert>
      ) : null}

      {isBoard ? (
        <Alert variant="info" title="Bundesvorstand">
          Du hast Bundesvorstands-Rechte.{" "}
          <Link href="/admin/pending-members" className="text-bdas-red hover:underline">
            Pending-Mitglieder verwalten →
          </Link>
        </Alert>
      ) : null}

      <Card flat className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-bdas-ink">
          {me.member ? "Profil bearbeiten" : "Profil vervollständigen"}
        </h2>
        <ProfileForm
          initial={{
            firstName: me.member?.firstName ?? "",
            lastName: me.member?.lastName ?? "",
            primaryGroupId: me.member?.primaryGroupId ?? null,
          }}
          groups={groups.map((g) => ({ id: g.id, slug: g.slug, name: g.name, city: g.city }))}
          isNew={!me.member}
        />
      </Card>

      <form action="/abmelden" method="post">
        <Button type="submit" variant="secondary">
          Abmelden
        </Button>
      </form>
    </main>
  );
}

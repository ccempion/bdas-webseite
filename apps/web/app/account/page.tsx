import Link from "next/link";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Alert, Button, Card } from "@bdas/design-system";
import { listGroups } from "@bdas/groups";
import { getCurrentMember, getOpenGroupChange, isFederalBoard } from "@bdas/members";

import { requireAuthFlag } from "../_auth/flag";
import { requireMembersFlag } from "../_members/flag";
import { readSessionCookie } from "../../lib/auth-cookie";
import { ProfileForm } from "./ProfileForm";
import { WithdrawChangeButton } from "./WithdrawChangeButton";

export const metadata = { title: "Mein Konto" };

const STATUS_LABEL: Record<string, string> = {
  pending: "Warte auf Freigabe durch den lokalen Vorstand.",
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
  const openChange = me.member ? await getOpenGroupChange(db, me.member.id) : null;

  const groupName = (id: string | null): string | null =>
    id === null ? null : (groups.find((g) => g.id === id)?.name ?? null);
  const currentGroupName = groupName(me.member?.primaryGroupId ?? null);
  const targetGroupName = groupName(openChange?.toGroupId ?? null);

  const isBoard = isFederalBoard(me.grants);
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

      {openChange && targetGroupName ? (
        <Alert variant="info" title="Gruppenwechsel beantragt">
          <span className="flex flex-col gap-2">
            <span>
              Du bist Mitglied bei <strong>{currentGroupName ?? "keiner Gruppe"}</strong> und hast
              den Wechsel zu <strong>{targetGroupName}</strong> beantragt (seit{" "}
              {new Date(openChange.requestedAt).toLocaleDateString("de-DE")}). Bis der Vorstand von{" "}
              {targetGroupName} entscheidet, bleibst du Mitglied bei{" "}
              {currentGroupName ?? "keiner Gruppe"}.
            </span>
            <WithdrawChangeButton />
          </span>
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
          openChangeGroupName={targetGroupName}
        />
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/account/datenexport">
          <Button variant="secondary">Meine Daten exportieren</Button>
        </Link>
        <form action="/abmelden" method="post">
          <Button type="submit" variant="secondary">
            Abmelden
          </Button>
        </form>
      </div>
    </main>
  );
}

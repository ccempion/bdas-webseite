import Link from "next/link";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Alert, Button, Card } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";
import { listGroups } from "@bdas/groups";
import { getCurrentMember, getOpenGroupChange, isFederalBoard } from "@bdas/members";
import { getProfile } from "@bdas/profile";

import { requireAuthFlag } from "../_auth/flag";
import { requireMembersFlag } from "../_members/flag";
import { AccountAvatar } from "./AccountAvatar";
import { isProfileComplete } from "../_profile/complete";
import { signedProfilePhotoUrl } from "../_profile/photo-url";
import { SUBMITTED_PARAM, SUBMITTED_VALUE } from "../_profile/submitted";
import { readSessionCookie } from "../../lib/auth-cookie";
import { EditableProfile } from "./EditableProfile";
import { buildProfileSummary } from "./profile-summary";
import { WithdrawChangeButton } from "./WithdrawChangeButton";

export const metadata = { title: "Mein Konto" };

const STATUS_LABEL: Record<string, string> = {
  pending: "Warte auf Freigabe durch den lokalen Vorstand.",
  active: "Aktives Mitglied.",
  inactive: "Inaktiv.",
  alumnus: "Alumnus.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  requireAuthFlag();
  requireMembersFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");

  const groups = await listGroups(db, { status: "active" });
  const openChange = me.member ? await getOpenGroupChange(db, me.member.id) : null;
  const profileFlagOn = isFlagOn("profile");
  const profile = profileFlagOn ? await getProfile(db, me.user.id) : null;
  const photoUrl = await signedProfilePhotoUrl(profile?.photoStorageKey);
  const initials =
    `${me.member?.firstName?.[0] ?? ""}${me.member?.lastName?.[0] ?? ""}`.toUpperCase() || "?";

  const groupName = (id: string | null): string | null =>
    id === null ? null : (groups.find((g) => g.id === id)?.name ?? null);
  const currentGroupName = groupName(me.member?.primaryGroupId ?? null);
  const targetGroupName = groupName(openChange?.toGroupId ?? null);

  // Everything filled in → the profile is a record to read, not a form to fill
  // (§3 "profile complete?" gate). Editing then needs an explicit step.
  const complete = profileFlagOn && me.member ? await isProfileComplete(db, me.user.id) : false;

  const membersFormProps = {
    initial: {
      firstName: me.member?.firstName ?? "",
      lastName: me.member?.lastName ?? "",
      primaryGroupId: me.member?.primaryGroupId ?? null,
    },
    groups: groups.map((g) => ({ id: g.id, slug: g.slug, name: g.name, city: g.city })),
    openChangeGroupName: targetGroupName,
  };

  const extendedInitial = {
    studiengang: profile?.studiengang ?? "",
    abschlussart: profile?.abschlussart ?? "",
    uni: profile?.uni ?? "",
    geburtsdatum: profile?.geburtsdatum ?? "",
    gefundenDurch: profile?.gefundenDurch ?? "",
    empfehlerName: profile?.empfehlerName ?? null,
    photoStorageKey: profile?.photoStorageKey ?? null,
  };

  const isBoard = isFederalBoard(me.grants);
  const status = me.member?.status;
  // Arrived straight from the wizard — say so, rather than leaving the applicant
  // to infer it from a status line that also shows on every later visit.
  const justSubmitted = searchParams?.[SUBMITTED_PARAM] === SUBMITTED_VALUE;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <header className="flex items-center gap-5">
        {profileFlagOn && me.member ? (
          <AccountAvatar photoUrl={photoUrl} initials={initials} />
        ) : null}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-bdas-ink">Mein Konto</h1>
          <p className="text-bdas-ink-body">{me.user.email}</p>
        </div>
      </header>

      {justSubmitted && status === "pending" ? (
        <Alert variant="success" title="Bewerbung abgeschickt">
          Deine Bewerbung ist eingegangen und liegt jetzt beim lokalen Vorstand zur Entscheidung.
        </Alert>
      ) : status === "pending" ? (
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
          <Link href="/federal/pool" className="text-bdas-red hover:underline">
            Mitglieder ohne Gruppe ansehen →
          </Link>
        </Alert>
      ) : null}

      <Card flat className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-bdas-ink">
          {complete ? "Meine Daten" : me.member ? "Profil bearbeiten" : "Profil vervollständigen"}
        </h2>
        <EditableProfile
          complete={complete}
          rows={buildProfileSummary({
            firstName: me.member?.firstName ?? "",
            lastName: me.member?.lastName ?? "",
            groupName: currentGroupName,
            studiengang: profile?.studiengang ?? "",
            abschlussart: profile?.abschlussart ?? "",
            uni: profile?.uni ?? "",
            geburtsdatum: profile?.geburtsdatum ?? "",
            gefundenDurch: profile?.gefundenDurch ?? "",
            empfehlerName: profile?.empfehlerName ?? null,
          })}
          profileForm={{ ...membersFormProps, isNew: !me.member }}
          extendedForm={profileFlagOn && me.member ? { initial: extendedInitial } : null}
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

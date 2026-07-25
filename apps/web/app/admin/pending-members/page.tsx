import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";
import { listGroups } from "@bdas/groups";
import { getCurrentMember, listPendingMembers } from "@bdas/members";
import {
  ABSCHLUSSART_OPTIONS,
  GEFUNDEN_DURCH_OPTIONS,
  getProfile,
  type MemberProfile,
} from "@bdas/profile";
import { getProfileMediaStorage } from "@bdas/storage";

import { requireAuthFlag } from "../../_auth/flag";
import { requireMembersFlag } from "../../_members/flag";
import { readSessionCookie } from "../../../lib/auth-cookie";
import { RowActions } from "./RowActions";

function labelFor(options: ReadonlyArray<{ value: string; label: string }>, key: string): string {
  return options.find((o) => o.value === key)?.label ?? key;
}

export const metadata = { title: "Pending-Mitglieder" };

/**
 * Temporary one-screen approval UI per build plan §3 Sprint 3.
 * The proper dashboard ships in Phase 3.
 */
export default async function PendingMembersPage() {
  requireAuthFlag();
  requireMembersFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");

  // listPendingMembers enforces board authority and scopes the list to the
  // actor's groups (federal_board → all) per ADR 0007.
  const [pending, groups] = await Promise.all([
    listPendingMembers(db, { userId: me.user.id, grants: me.grants }),
    listGroups(db),
  ]);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const profileEnabled = isFlagOn("profile");
  const profileByUserId = new Map<string, MemberProfile | null>();
  const photoUrlByUserId = new Map<string, string>();
  if (profileEnabled) {
    const profiles = await Promise.all(pending.map((m) => getProfile(db, m.userId)));
    pending.forEach((m, i) => profileByUserId.set(m.userId, profiles[i] ?? null));

    const photoEntries = await Promise.all(
      pending.map(async (m) => {
        const storageKey = profileByUserId.get(m.userId)?.photoStorageKey;
        if (!storageKey) return null;
        try {
          const signed = await getProfileMediaStorage().signedDownloadUrl({
            storageKey,
            ttlSeconds: 300,
          });
          return [m.userId, signed.url] as const;
        } catch {
          // Missing/unreadable object must not break the page — no image, no error.
          return null;
        }
      }),
    );
    for (const entry of photoEntries) {
      if (entry) photoUrlByUserId.set(entry[0], entry[1]);
    }
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-bdas-ink">Pending-Mitglieder</h1>
        <p className="text-bdas-ink-body">
          Mitglieder mit eingereichtem Profil, die auf eine Entscheidung des Vorstands warten.
        </p>
      </header>

      {pending.length === 0 ? (
        <Alert variant="info" title="Keine offenen Anträge">
          Alle Mitgliedsanträge sind bearbeitet.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((m) => {
            const group = m.primaryGroupId ? groupById.get(m.primaryGroupId) : undefined;
            const profile = profileEnabled ? profileByUserId.get(m.userId) : undefined;
            const photoUrl = profileEnabled ? photoUrlByUserId.get(m.userId) : undefined;
            return (
              <li key={m.id}>
                <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  {profileEnabled ? (
                    <div className="flex flex-1 gap-4">
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={`Profilbild von ${m.firstName} ${m.lastName}`}
                          className="h-16 w-16 flex-none rounded-bdas-sm object-cover"
                        />
                      ) : null}
                      <div className="flex flex-col gap-1">
                        <p className="text-lg font-semibold text-bdas-ink">
                          {m.firstName} {m.lastName}
                        </p>
                        <p className="text-sm text-bdas-ink-muted">
                          {group ? `${group.name} (${group.city})` : "Keine Gruppe ausgewählt"}
                        </p>
                        {profile ? (
                          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-sm text-bdas-ink-body">
                            <dt className="text-bdas-ink-muted">Studiengang</dt>
                            <dd>{profile.studiengang}</dd>
                            <dt className="text-bdas-ink-muted">Abschlussart</dt>
                            <dd>{labelFor(ABSCHLUSSART_OPTIONS, profile.abschlussart)}</dd>
                            <dt className="text-bdas-ink-muted">Hochschule</dt>
                            <dd>{profile.uni}</dd>
                            <dt className="text-bdas-ink-muted">Geburtsdatum</dt>
                            <dd>{profile.geburtsdatum}</dd>
                            <dt className="text-bdas-ink-muted">Gefunden über</dt>
                            <dd>
                              {labelFor(GEFUNDEN_DURCH_OPTIONS, profile.gefundenDurch)}
                              {profile.empfehlerName ? ` (${profile.empfehlerName})` : ""}
                            </dd>
                          </dl>
                        ) : (
                          <p className="mt-1 text-sm text-bdas-ink-muted">
                            Profil noch nicht ausgefüllt
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-lg font-semibold text-bdas-ink">
                        {m.firstName} {m.lastName}
                      </p>
                      <p className="text-sm text-bdas-ink-muted">
                        {group ? `${group.name} (${group.city})` : "Keine Gruppe ausgewählt"}
                      </p>
                    </div>
                  )}
                  <RowActions memberId={m.id} />
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

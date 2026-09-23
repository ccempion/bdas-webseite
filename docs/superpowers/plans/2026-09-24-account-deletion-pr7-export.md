# Konto-Löschung — PR7: Export-Vervollständigung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Art.-15-Export deckt jedes Modul ab, das personenbezogene Daten hält (auth, sessions, members, Rollen, Gruppenwechsel-Anträge, profile, events inkl. Anmeldungen/Anwesenheit, files, blog, notifications), wird als ZIP mit einer CSV pro Kategorie ausgeliefert und per E-Mail B (`data_export_ready`) mit dem ZIP als Anhang verschickt. Er löscht nichts.

**Architecture:** Jedes datenhaltende Modul liefert seinen eigenen Ausschnitt über eine typisierte, im `index.ts` exportierte Funktion (Rule 1/8). Der Zusammenbau über alle Module passiert ausschließlich in `apps/web/lib/data-export/` (Composition-Schicht — dort dürfen alle Module importiert werden, die Module untereinander nicht). Der Assembler bekommt nur das Session-Prinzipal (`CurrentMember`); es gibt nirgends einen id-Parameter von außen, der Scoping-Beweis liegt in den Modul-Tests (zwei Nutzer, echtes Postgres) plus einem Assembler-Test, der prüft, dass jeder Reader nur mit den ids des Prinzipals aufgerufen wird.

**Tech Stack:** TypeScript, Drizzle ORM, Vitest + echtes Postgres (Docker), `fflate` (neu — siehe Entscheidung D1), Next.js 14 Route Handler + Server Action.

**Spec:** `docs/superpowers/specs/2026-09-22-account-deletion-design.md` — §6 (Datenexport-Vervollständigung), §8 (E-Mail B), §9 (Flag). Baut auf ADR 0008 (Export-Stub) auf.

## Aufteilung und bestätigte Entscheidungen (2026-09-24)

Alle fünf Entscheidungen unten sind bestätigt. **D2 geändert:** kein Einzel-PR, sondern zwei PRs.

- **PR7a — Modul-Lese-Funktionen** (Branch `feat/account-deletion-pr7a-export-readers`): Tasks 1–3 (events, members, auth). Reine Leser, ungenutzt bis PR7b. Dieser Plan wird als erster Commit von PR7a eingecheckt.
- **PR7b — CSV/ZIP/Route/UI/Mail** (nach Merge von PR7a, eigener Branch von `main`): Tasks 4–7. Der Plan wird im letzten Commit von PR7b nach `docs/archive/superpowers/` verschoben.
- **D1** `fflate` ✔ (ADR 0054 in PR7b). **D3** kein Resolver für events ✔. **D4** E-Mail B ohne Rate-Limiting ✔ — **Folgepunkt fürs Ledger: Rate-Limiter für die E-Mail-B-Aktion** (`notification_log`-Zählung oder auth-Limiter exportieren). **D5** Flag-Zuschnitt ✔; Gast-Anmeldungen bleiben draußen ✔.
- **Verifikation vor jedem Push:** die DB-Tests laufen lokal gegen den Docker-Container `bdas-postgres` (Port 5432, `postgres://bdas:bdas@localhost:5432/bdas`). Ein Lauf mit `skipped` gilt nicht als grün (PR6-Lehre).

## Entscheidungen (ursprüngliche Vorlage)

| #   | Punkt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Empfehlung                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Neue Abhängigkeit `fflate`** (ZIP). Im Repo gibt es keine ZIP-Bibliothek. CLAUDE.md §2 verlangt für Stack-Änderungen Freigabe + ADR.                                                                                                                                                                                                                                                                                                                                                                       | `fflate` (kein Transitive-Dep, rein JS, `zipSync`/`unzipSync`), ADR 0054. Alternative: selbst geschriebener STORE-only-ZIP-Writer (~60 Zeilen CRC32 + Header) — kein Dep, aber ein Format-Parser in eigenem Code, den wir testen und pflegen.                                                                                |
| D2  | **Ein PR statt „ein Modul pro PR"** (CLAUDE.md §4). PR7 berührt events, members, auth (je eine kleine Lese-Funktion) plus `apps/web`. Es sind reine Leser, ~30 Zeilen je Modul.                                                                                                                                                                                                                                                                                                                              | Ein PR, ein Commit-Block pro Modul, Task 5 als natürliche Trennlinie. Falls du strikt splitten willst: PR7a = Task 1–3, PR7b = Task 4–7.                                                                                                                                                                                     |
| D3  | **Events-Anmeldungen ohne `MemberIdResolver`.** Die Gedächtnisnotiz sagt „PR7 braucht einen Resolver". Das trifft nur zu, wenn `events` mit `userId` aufgerufen wird. `events` kennt das Muster schon andersherum (`listMyUpcomingRegistrations(db, memberId)`); die Route hat `me.member.id` aus der Session. Ein Resolver wäre eine zusätzliche Stelle, die still leer zurückgibt, wenn er nicht verdrahtet ist (files/notifications tun genau das) — für Auskunftsvollständigkeit das schlechtere Muster. | `exportParticipationForMember(db, memberId)`, `memberId` kommt nur aus der Session.                                                                                                                                                                                                                                          |
| D4  | **E-Mail B ist auf Abruf** (Button in `/account/einstellungen`), nicht automatisch. Ohne Drosselung kann ein eingeloggter Nutzer beliebig oft ein ZIP an die eigene Adresse auslösen. `auth` exportiert keinen Rate-Limiter.                                                                                                                                                                                                                                                                                 | Vorerst ungedrosselt (Selbstschaden, Resend-Kosten minimal), in Review Focus vermerkt. Drosselung wäre ein eigenes Thema (`notification_log`-Zählung oder auth-Limiter exportieren).                                                                                                                                         |
| D5  | **Feature-Flag-Zuschnitt.** Spec §9: `account_deletion` gated Button/Routen. Der bestehende JSON-Download ist heute schon live (nur `auth`+`members`-Flags).                                                                                                                                                                                                                                                                                                                                                 | JSON-Download bleibt unter den bisherigen Flags, wird aber vollständiger (mehr Vollständigkeit ist kein Risiko). ZIP-Format und E-Mail-B-Versand nur mit `account_deletion`. Module mit ausgeschaltetem eigenem Flag (`files`, `blog`, `events`, `notifications`, `profile`) werden übersprungen und im Manifest so benannt. |

## Global Constraints

- Rule 1 (CLAUDE.md §1): `modules/events`, `modules/members`, `modules/auth` importieren einander nicht; jede neue Funktion liest nur Tabellen ihres eigenen Moduls.
- Rule 5: Integrationstests laufen gegen echtes Postgres (`describeIfDb`, `createTestDb`), keine DB-Mocks. Der Assembler in `apps/web/lib` bekommt seine Reader injiziert und wird mit Stub-Readern getestet — das ist kein DB-Mock, sondern die Prüfung des Aufrufvertrags; die DB-Wahrheit liegt in den Modul-Tests.
- Rule 8: neue Modul-Funktionen nur über das jeweilige `src/index.ts` sichtbar.
- Kein Feld, das eine **fremde** Person identifiziert oder ein Geheimnis ist, verlässt den Export: nicht `granted_by`/`revoked_by`/`decided_by`/`checked_in_by`, nicht die Session-`id`, nicht `guest_cancel_token`, nicht Datei-`storage_key`.
- Export ist ausschließlich das eigene Datum der Session-Person. Keine Funktion nimmt eine id aus Request-Parametern.
- Design-Tokens in UI: keine Inline-Hex/Radien/Dauern (CLAUDE.md §7); vorhandene `Card`/`Button`/Dialog-Muster verwenden.
- Vor jedem Commit `pnpm format` (Prettier-CI schlägt sonst an — Memory-Notiz).
- `/security-review` am Ende, weil ein Export personenbezogener (teils sensibler) Daten ausgeliefert wird. Danach `/review`.
- Plan und Spec ziehen im letzten Commit des PR nach `docs/archive/superpowers/` (CLAUDE.md §4); vorher ADRs/READMEs nach dem Dateinamen greppen.

## Review Focus

Diese Fälle nennt die Spec nicht, sie beißen aber im Betrieb:

1. **Konto ohne Mitgliedszeile** (`me.member === null`, z. B. gerade registriert/kein Profil): Export darf nicht abstürzen, liefert Konto+Sessions+Profil-falls-vorhanden, Member-Kategorien leer. → Test in Task 5, Task 6.
2. **Modul-Flag aus, Daten trotzdem vorhanden** (Flag wurde später abgeschaltet): der Export lässt die Kategorie aus und sagt es im Manifest, statt still „leer" zu behaupten. → Task 5 (`skipped`-Eintrag im Manifest).
3. **Zellen mit `=`, `+`, `-`, `@` am Anfang und Zeilenumbrüche/Kommata/Anführungszeichen in Freitext** (Blogtext, `vorstellung`, `reasonMessage`): CSV bleibt spaltenkorrekt, Excel führt nichts aus. → Task 4.
4. **Leere Kategorie**: es entsteht trotzdem eine CSV mit Kopfzeile (bzw. Hinweis-Zeile), damit „keine Daten" von „Kategorie vergessen" unterscheidbar ist. → Task 4/5.
5. **Ungültige/abgelaufene Session bei der E-Mail-Aktion**: keine Mail, Fehlerstatus „Anmeldung erforderlich.", kein Anhang an eine fremde Adresse; ebenso schlägt ein fehlgeschlagener Versand als Fehler durch statt als stiller Erfolg. → Task 6.

Zusätzlich bewusst **nicht** im Export und im README vermerkt: Gast-Anmeldungen zu Veranstaltungen (`event_registrations.guest_email`) — sie sind an eine E-Mail-Adresse, nicht an ein Konto gebunden und nicht als „dieselbe Person" belegbar. Und: **Religionszugehörigkeit ist im Datenmodell nicht gespeichert** (kein Feld in `members`/`member_profiles`/`auth_users`); die sensibelsten vorhandenen Felder sind `geburtsdatum`, `studiengang`/`studienfachKategorie` (z. B. „Kath. Theologie") und `vorstellung` — sie liegen im `profile`-Export und sind dort korrekt gescopt.

---

## File Structure

| Datei                                                  | Verantwortung                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `modules/events/src/services/gdpr.ts` (ändern)         | `exportParticipationForMember` + Docstring-Korrektur                                         |
| `modules/events/src/index.ts` (ändern)                 | Re-Export                                                                                    |
| `modules/events/src/gdpr.test.ts` (ändern)             | Tests dazu                                                                                   |
| `modules/members/src/services/export.ts` (neu)         | `exportForUser`: Mitglied, alle Rollen-Grants, Gruppenwechsel-Anträge                        |
| `modules/members/src/index.ts` (ändern)                | Re-Export                                                                                    |
| `modules/members/src/export.test.ts` (neu)             | Tests dazu                                                                                   |
| `modules/auth/src/services/export.ts` (ändern)         | `exportSessionsForUser`                                                                      |
| `modules/auth/src/index.ts` (ändern)                   | Re-Export                                                                                    |
| `modules/auth/src/services/export.test.ts` (ändern)    | Tests dazu                                                                                   |
| `apps/web/lib/data-export/csv.ts` (neu)                | `rowsToCsv` — pure, RFC-4180 + Formel-Guard                                                  |
| `apps/web/lib/data-export/zip.ts` (neu)                | `buildZip` — dünner Wrapper um `fflate`                                                      |
| `apps/web/lib/data-export/assemble.ts` (neu)           | `buildDataExport(readers, principal)` → Kategorien + Manifest; `bundleAsZip`                 |
| `apps/web/lib/data-export/readers.ts` (neu)            | verdrahtet die echten Modul-Funktionen zu `Readers` (einzige Stelle mit allen Modul-Imports) |
| `apps/web/lib/data-export/*.test.ts` (neu)             | Unit-Tests (kein DB nötig)                                                                   |
| `apps/web/app/account/datenexport/route.ts` (ändern)   | JSON vollständig; `?format=zip` mit Flag                                                     |
| `apps/web/app/account/data-export-actions.ts` (neu)    | Server Action `sendDataExportAction`: E-Mail B mit ZIP-Anhang                                |
| `apps/web/app/account/SendDataExportButton.tsx` (neu)  | Client-Button mit Ergebnisanzeige (Muster: `DeleteAccountCard.tsx`)                          |
| `apps/web/app/account/einstellungen/page.tsx` (ändern) | Buttons „Als ZIP" / „Per E-Mail"                                                             |
| `docs/decisions/0054-datenexport-csv-zip.md` (neu)     | ADR: Format, `fflate`, Scoping-Regeln, Ausschlüsse                                           |
| `modules/{events,members,auth}/README.md` (ändern)     | neue öffentliche Funktionen, Ausschlüsse                                                     |

---

### Task 1: events — Teilnahme-Export (Anmeldungen + Anwesenheit)

**Files:**

- Modify: `modules/events/src/services/gdpr.ts`
- Modify: `modules/events/src/index.ts:36`
- Test: `modules/events/src/gdpr.test.ts`

**Interfaces:**

- Consumes: `eventRegistrations`, `eventAttendance`, `events` aus `../schema` (Spalten siehe `schema.ts:51-74`).
- Produces:

```ts
export type ParticipationRegistration = {
  readonly registrationId: string;
  readonly eventId: string;
  readonly eventTitle: string;
  readonly eventStartsAt: Date;
  readonly registeredAt: Date;
  readonly cancelledAt: Date | null;
  readonly waitlistPosition: number | null;
};
export type ParticipationAttendance = {
  readonly eventId: string;
  readonly eventTitle: string;
  readonly eventStartsAt: Date;
  readonly attended: boolean;
  readonly checkedInAt: Date | null;
};
export type ParticipationExport = {
  readonly registrations: readonly ParticipationRegistration[];
  readonly attendance: readonly ParticipationAttendance[];
};
export async function exportParticipationForMember(
  db: Db,
  memberId: string,
): Promise<ParticipationExport>;
```

- [ ] **Step 1: Failing tests schreiben** — in `gdpr.test.ts` im bestehenden `describeIfDb`-Block einen neuen `describe("exportParticipationForMember")` ergänzen. Imports oben erweitern: `import { exportParticipationForMember, clearOrganizerForUser, exportForUser } from "./services/gdpr";`, `import { publishEvent } from "./services/manage";`, `import { cancelRegistration, registerMember } from "./services/registration";`, `import { eventAttendance } from "./schema";`, `import { resetEventBus } from "@bdas/events";` (Bus-Reset wie in `services/mine.test.ts`). Members/Auth-Zeilen für `event_registrations.member_id` müssen real existieren (FK) — Seed wie `services/mine.test.ts:66-75`.

```ts
describe("exportParticipationForMember", () => {
  beforeEach(async () => {
    resetEventBus();
    for (const id of ["mbr_me", "mbr_other"]) {
      await t.client`
        INSERT INTO auth_users (id, email_normalized, email_display, status)
        VALUES (${"usr_" + id}, ${id + "@e2e.test"}, ${id + "@e2e.test"}, 'active')`;
      await t.client`
        INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
        VALUES (${id}, ${"usr_" + id}, 'Test', ${id}, NULL, 'active')`;
    }
  });

  async function published(title: string): Promise<string> {
    const ev = await createEvent(
      t.db,
      { title, startsAt: future(), visibility: "public" },
      "usr_creator",
    );
    await publishEvent(t.db, ev.id);
    return ev.id;
  }

  it("returns own registrations incl. cancelled and waitlisted, never another member's", async () => {
    const a = await published("Stammtisch");
    const b = await published("Sommerfest");
    await registerMember(t.db, a, "mbr_me");
    await registerMember(t.db, b, "mbr_me");
    await cancelRegistration(t.db, b, "mbr_me");
    await registerMember(t.db, a, "mbr_other");

    const result = await exportParticipationForMember(t.db, "mbr_me");

    expect(result.registrations.map((r) => r.eventTitle).sort()).toEqual([
      "Sommerfest",
      "Stammtisch",
    ]);
    const cancelled = result.registrations.find((r) => r.eventTitle === "Sommerfest");
    expect(cancelled?.cancelledAt).toBeInstanceOf(Date);
    const all = JSON.stringify(result);
    expect(all).not.toContain("mbr_other");
  });

  it("exposes waitlist position", async () => {
    const id = await published("Voll");
    await registerMember(t.db, id, "mbr_me");
    await t.client`UPDATE event_registrations SET waitlist_position = 2 WHERE member_id = 'mbr_me'`;

    const result = await exportParticipationForMember(t.db, "mbr_me");

    expect(result.registrations[0]?.waitlistPosition).toBe(2);
  });

  it("returns own attendance rows and omits the checker's identity", async () => {
    const ev = await createEvent(
      t.db,
      { title: "Vergangen", startsAt: future(-3), visibility: "public" },
      "usr_creator",
    );
    await t.db.insert(eventAttendance).values({
      id: "att_me",
      eventId: ev.id,
      memberId: "mbr_me",
      attended: true,
      checkedInBy: "mbr_other",
    });
    await t.db.insert(eventAttendance).values({
      id: "att_other",
      eventId: ev.id,
      memberId: "mbr_other",
      attended: true,
    });

    const result = await exportParticipationForMember(t.db, "mbr_me");

    expect(result.attendance).toHaveLength(1);
    expect(result.attendance[0]?.attended).toBe(true);
    expect(Object.keys(result.attendance[0] ?? {})).not.toContain("checkedInBy");
    expect(JSON.stringify(result)).not.toContain("mbr_other");
  });

  it("returns empty lists for a member with no participation", async () => {
    expect(await exportParticipationForMember(t.db, "mbr_me")).toEqual({
      registrations: [],
      attendance: [],
    });
  });
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `pnpm --filter @bdas/events-module exec vitest run src/gdpr.test.ts`
Expected: FAIL — `exportParticipationForMember is not a function` (nicht exportiert).

- [ ] **Step 3: Implementieren** — in `modules/events/src/services/gdpr.ts` Imports auf `import { asc, eq } from "drizzle-orm";` und `import { eventAttendance, eventRegistrations, events } from "../schema";` erweitern; den Modul-Docstring-Absatz „NOT covered … PR7's job" (Zeilen 11-17) durch „Registrations/attendance are exported by `exportParticipationForMember` (keyed by `members.id`, passed in by the caller from the session)" ersetzen; unten anfügen:

```ts
export async function exportParticipationForMember(
  db: Db,
  memberId: string,
): Promise<ParticipationExport> {
  const registrations = await db
    .select({
      registrationId: eventRegistrations.id,
      eventId: events.id,
      eventTitle: events.title,
      eventStartsAt: events.startsAt,
      registeredAt: eventRegistrations.registeredAt,
      cancelledAt: eventRegistrations.cancelledAt,
      waitlistPosition: eventRegistrations.waitlistPosition,
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .where(eq(eventRegistrations.memberId, memberId))
    .orderBy(asc(eventRegistrations.registeredAt));

  const attendance = await db
    .select({
      eventId: events.id,
      eventTitle: events.title,
      eventStartsAt: events.startsAt,
      attended: eventAttendance.attended,
      checkedInAt: eventAttendance.checkedInAt,
    })
    .from(eventAttendance)
    .innerJoin(events, eq(eventAttendance.eventId, events.id))
    .where(eq(eventAttendance.memberId, memberId))
    .orderBy(asc(events.startsAt));

  return { registrations, attendance };
}
```

(Typen aus dem Interfaces-Block direkt über der Funktion deklarieren.) In `index.ts:36` auf `export { clearOrganizerForUser, exportForUser, exportParticipationForMember, type ParticipationExport, type ParticipationRegistration, type ParticipationAttendance } from "./services/gdpr";` erweitern.

- [ ] **Step 4: Tests grün**

Run: `pnpm --filter @bdas/events-module exec vitest run src/gdpr.test.ts`
Expected: PASS (alle, inkl. der bestehenden GDPR-Tests).

- [ ] **Step 5: Commit**

```bash
pnpm format
git add modules/events
git commit -m "feat(events): export member registrations and attendance (DSGVO Art. 15)"
```

---

### Task 2: members — Mitglied, Rollen-Grants, Gruppenwechsel-Anträge

**Files:**

- Create: `modules/members/src/services/export.ts`
- Modify: `modules/members/src/index.ts`
- Test: `modules/members/src/export.test.ts`

**Interfaces:**

- Consumes: `members`, `memberRoleGrants`, `memberGroupChangeRequests` aus `../schema`; Test-Helfer `setupMembersDb`, `createUser`, `createGroup`, `dbReachable` aus `../test-db`.
- Produces:

```ts
export type MemberExport = {
  readonly member: {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly primaryGroupId: string | null;
    readonly status: string;
    readonly joinedAt: Date | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  } | null;
  readonly roleGrants: ReadonlyArray<{
    readonly role: string;
    readonly groupId: string | null;
    readonly grantedAt: Date;
    readonly revokedAt: Date | null;
  }>;
  readonly groupChangeRequests: ReadonlyArray<{
    readonly id: string;
    readonly fromGroupId: string | null;
    readonly toGroupId: string | null;
    readonly status: string;
    readonly requestedAt: Date;
    readonly decidedAt: Date | null;
    readonly reasonCategory: string | null;
    readonly reasonMessage: string | null;
  }>;
};
export async function exportForUser(db: Db, userId: string): Promise<MemberExport>;
```

`grantedBy`/`revokedBy`/`decidedBy` sind bewusst nicht enthalten (Ids anderer Personen).

- [ ] **Step 1: Failing test schreiben** — `modules/members/src/export.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { exportForUser } from "./services/export";
import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

describeIfDb("members exportForUser", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupMembersDb();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
    for (const [uid, mid, mail] of [
      ["usr_me", "mem_me", "me@example.de"],
      ["usr_other", "mem_other", "other@example.de"],
    ] as const) {
      await createUser(t, uid, mail);
      await t.client`
        INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
        VALUES (${mid}, ${uid}, 'Test', ${mid}, 'grp_a', 'active')`;
    }
    await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by, revoked_at, revoked_by)
      VALUES ('g1', 'mem_me', 'blogger', NULL, 'mem_other', now(), 'mem_other'),
             ('g2', 'mem_me', 'file_manager', NULL, 'mem_other', NULL, NULL),
             ('g3', 'mem_other', 'blogger', NULL, 'mem_me', NULL, NULL)`;
    await t.client`
      INSERT INTO member_group_change_requests
        (id, member_id, from_group_id, to_group_id, status, decided_at, decided_by, reason_category, reason_message)
      VALUES ('r1', 'mem_me', 'grp_b', 'grp_a', 'rejected', now(), 'mem_other', 'other', 'Zu viele Anfragen'),
             ('r2', 'mem_me', 'grp_a', 'grp_b', 'approved', now(), 'mem_other', NULL, NULL),
             ('r3', 'mem_other', 'grp_a', 'grp_b', 'pending', NULL, NULL, NULL, NULL)`;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("returns the member row, all grants incl. revoked, and all group-change requests", async () => {
    const result = await exportForUser(t.db, "usr_me");

    expect(result.member?.id).toBe("mem_me");
    expect(result.roleGrants.map((g) => g.role).sort()).toEqual(["blogger", "file_manager"]);
    expect(result.roleGrants.find((g) => g.role === "blogger")?.revokedAt).toBeInstanceOf(Date);
    expect(result.groupChangeRequests.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    expect(result.groupChangeRequests.find((r) => r.id === "r1")?.reasonMessage).toBe(
      "Zu viele Anfragen",
    );
  });

  it("never leaks another member's rows or the deciding/granting person's id", async () => {
    const json = JSON.stringify(await exportForUser(t.db, "usr_me"));

    expect(json).not.toContain("r3");
    expect(json).not.toContain("mem_other");
    expect(json).not.toContain("usr_other");
  });

  it("returns member: null and empty lists for an account without a member row", async () => {
    await createUser(t, "usr_bare", "bare@example.de");

    expect(await exportForUser(t.db, "usr_bare")).toEqual({
      member: null,
      roleGrants: [],
      groupChangeRequests: [],
    });
  });
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `pnpm --filter @bdas/members exec vitest run src/export.test.ts`
Expected: FAIL — Modul `./services/export` nicht gefunden.

- [ ] **Step 3: Implementieren** — `modules/members/src/services/export.ts`:

```ts
/**
 * Art. 15 — this module's slice of a user's data export: their member row,
 * every role grant they ever held (revoked ones too — the row is still their
 * data), and their group-change requests. Keyed by the auth `userId`; the
 * member id is resolved here, inside the module that owns `members`.
 *
 * `granted_by`/`revoked_by`/`decided_by` are deliberately omitted: they are
 * other people's member ids and not data *about* the exporting user.
 */
import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { memberGroupChangeRequests, memberRoleGrants, members } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type MemberExport = {
  readonly member: {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly primaryGroupId: string | null;
    readonly status: string;
    readonly joinedAt: Date | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  } | null;
  readonly roleGrants: ReadonlyArray<{
    readonly role: string;
    readonly groupId: string | null;
    readonly grantedAt: Date;
    readonly revokedAt: Date | null;
  }>;
  readonly groupChangeRequests: ReadonlyArray<{
    readonly id: string;
    readonly fromGroupId: string | null;
    readonly toGroupId: string | null;
    readonly status: string;
    readonly requestedAt: Date;
    readonly decidedAt: Date | null;
    readonly reasonCategory: string | null;
    readonly reasonMessage: string | null;
  }>;
};

export async function exportForUser(db: Db, userId: string): Promise<MemberExport> {
  const [row] = await db.select().from(members).where(eq(members.userId, userId)).limit(1);
  if (!row) return { member: null, roleGrants: [], groupChangeRequests: [] };

  const roleGrants = await db
    .select({
      role: memberRoleGrants.role,
      groupId: memberRoleGrants.groupId,
      grantedAt: memberRoleGrants.grantedAt,
      revokedAt: memberRoleGrants.revokedAt,
    })
    .from(memberRoleGrants)
    .where(eq(memberRoleGrants.memberId, row.id))
    .orderBy(asc(memberRoleGrants.grantedAt));

  const groupChangeRequests = await db
    .select({
      id: memberGroupChangeRequests.id,
      fromGroupId: memberGroupChangeRequests.fromGroupId,
      toGroupId: memberGroupChangeRequests.toGroupId,
      status: memberGroupChangeRequests.status,
      requestedAt: memberGroupChangeRequests.requestedAt,
      decidedAt: memberGroupChangeRequests.decidedAt,
      reasonCategory: memberGroupChangeRequests.reasonCategory,
      reasonMessage: memberGroupChangeRequests.reasonMessage,
    })
    .from(memberGroupChangeRequests)
    .where(eq(memberGroupChangeRequests.memberId, row.id))
    .orderBy(asc(memberGroupChangeRequests.requestedAt));

  return {
    member: {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      primaryGroupId: row.primaryGroupId,
      status: row.status,
      joinedAt: row.joinedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    roleGrants,
    groupChangeRequests,
  };
}
```

In `modules/members/src/index.ts` neben den anderen Service-Re-Exports ergänzen: `export { exportForUser, type MemberExport } from "./services/export";`. (Vor dem Schreiben `grep -n "exportForUser" modules/members/src/index.ts` — kein Namenskonflikt erwartet, `members` exportiert bisher keines.)

- [ ] **Step 3b:** `setupMembersDb` lädt die members-Migrationen; falls `groups`-FK-Spalten `from_group_id`/`to_group_id` einen Test-Fehler liefern, `createGroup`-Signatur in `test-db.ts:71` prüfen (der Test nutzt es exakt wie `group-change.test.ts:44-45`).

- [ ] **Step 4: Tests grün**

Run: `pnpm --filter @bdas/members exec vitest run src/export.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
pnpm format
git add modules/members
git commit -m "feat(members): export member row, role grants and group-change requests (DSGVO Art. 15)"
```

---

### Task 3: auth — Sitzungen

**Files:**

- Modify: `modules/auth/src/services/export.ts`
- Modify: `modules/auth/src/index.ts:61`
- Test: `modules/auth/src/services/export.test.ts`

**Interfaces:**

- Consumes: `authSessions` aus `../schema`.
- Produces:

```ts
export type SessionExport = {
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
};
export async function exportSessionsForUser(
  db: Db,
  userId: string,
): Promise<readonly SessionExport[]>;
```

Die Session-`id` fehlt bewusst: sie ist der Bearer-Bezeichner der Sitzung.

- [ ] **Step 1: Failing test** — im bestehenden `describeIfDb("getUserEmails")`-Umfeld einen zweiten `describeIfDb("exportSessionsForUser")` mit identischem `beforeEach` (Migrationsliste aus dem ersten Block kopieren — die Datei lädt `0001_init.sql`ff.) ergänzen; Seeds direkt per SQL:

```ts
it("returns own sessions newest first, without the session id, never another user's", async () => {
  await t.client`
    INSERT INTO auth_users (id, email_normalized, email_display, status)
    VALUES ('usr_a', 'a@e2e.test', 'a@e2e.test', 'active'), ('usr_b', 'b@e2e.test', 'b@e2e.test', 'active')`;
  await t.client`
    INSERT INTO auth_sessions (id, user_id, expires_at, ip, user_agent, created_at)
    VALUES ('sid_old', 'usr_a', now() + interval '1 day', '10.0.0.1', 'UA-old', now() - interval '2 days'),
           ('sid_new', 'usr_a', now() + interval '1 day', '10.0.0.2', 'UA-new', now()),
           ('sid_b',   'usr_b', now() + interval '1 day', '10.0.0.3', 'UA-b',   now())`;

  const result = await exportSessionsForUser(t.db, "usr_a");

  expect(result.map((s) => s.userAgent)).toEqual(["UA-new", "UA-old"]);
  const json = JSON.stringify(result);
  expect(json).not.toContain("sid_");
  expect(json).not.toContain("10.0.0.3");
  expect(Object.keys(result[0] ?? {}).sort()).toEqual(
    ["createdAt", "expiresAt", "ip", "revokedAt", "userAgent"].sort(),
  );
});

it("returns an empty array for a user without sessions", async () => {
  expect(await exportSessionsForUser(t.db, "usr_nobody")).toEqual([]);
});
```

- [ ] **Step 2:** `pnpm --filter @bdas/auth exec vitest run src/services/export.test.ts` — Expected: FAIL (`exportSessionsForUser` fehlt).
- [ ] **Step 3: Implementieren** — in `services/export.ts` `desc` in den drizzle-Import aufnehmen (`import { desc, eq, inArray } from "drizzle-orm";`), `authSessions` in den Schema-Import, dann:

```ts
export type SessionExport = {
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
};

export async function exportSessionsForUser(
  db: Db,
  userId: string,
): Promise<readonly SessionExport[]> {
  return db
    .select({
      createdAt: authSessions.createdAt,
      expiresAt: authSessions.expiresAt,
      revokedAt: authSessions.revokedAt,
      ip: authSessions.ip,
      userAgent: authSessions.userAgent,
    })
    .from(authSessions)
    .where(eq(authSessions.userId, userId))
    .orderBy(desc(authSessions.createdAt));
}
```

Und `index.ts:61` → `export { getUserEmails, getUserExport, exportSessionsForUser, type UserExport, type SessionExport } from "./services/export";`.

- [ ] **Step 4:** Test erneut — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
pnpm format
git add modules/auth
git commit -m "feat(auth): export own sessions without session ids (DSGVO Art. 15)"
```

---

### Task 4: CSV- und ZIP-Bausteine (apps/web, pure)

**Files:**

- Modify: `apps/web/package.json` (Dependency `fflate` — nach Freigabe D1)
- Create: `apps/web/lib/data-export/csv.ts`, `apps/web/lib/data-export/zip.ts`
- Test: `apps/web/lib/data-export/csv.test.ts`, `apps/web/lib/data-export/zip.test.ts`

**Interfaces:**

- Produces:

```ts
export type Row = Readonly<Record<string, unknown>>;
export function rowsToCsv(columns: readonly string[], rows: readonly Row[]): string;
export type ZipEntry = { readonly name: string; readonly content: string };
export function buildZip(entries: readonly ZipEntry[]): Uint8Array;
```

Zellenregeln: `Date` → ISO-8601; `null`/`undefined` → leer; Objekt/Array → `JSON.stringify`; Formel-Guard wie `apps/web/lib/roster-csv.ts:cell` (führendes `= + - @ \t \r` → `'`-Präfix); RFC-4180-Quoting bei `" , \n \r`; Zeilenende `\r\n`; UTF-8-BOM vorangestellt (Excel öffnet Umlaute korrekt).

- [ ] **Step 1:** `pnpm --filter @bdas/web add fflate` (Paketname aus `apps/web/package.json` prüfen). Failing Tests:

```ts
// csv.test.ts
import { describe, expect, it } from "vitest";
import { rowsToCsv } from "./csv";

describe("rowsToCsv", () => {
  it("writes BOM, header and CRLF rows", () => {
    expect(rowsToCsv(["a", "b"], [{ a: "x", b: "y" }])).toBe("﻿a,b\r\nx,y\r\n");
  });
  it("quotes commas, quotes and newlines", () => {
    const csv = rowsToCsv(["t"], [{ t: 'a,"b"\nc' }]);
    expect(csv).toBe('﻿t\r\n"a,""b""\nc"\r\n');
  });
  it("neutralises spreadsheet formulas", () => {
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) {
      expect(
        rowsToCsv(["t"], [{ t: bad }])
          .split("\r\n")[1]
          ?.replace(/^"/, ""),
      ).toMatch(/^'/);
    }
  });
  it("renders dates as ISO, null as empty, objects as JSON", () => {
    const d = new Date("2026-09-24T10:00:00.000Z");
    expect(rowsToCsv(["d", "n", "o"], [{ d, n: null, o: { k: 1 } }])).toBe(
      '﻿d,n,o\r\n2026-09-24T10:00:00.000Z,,"{""k"":1}"\r\n',
    );
  });
  it("writes only the header for zero rows", () => {
    expect(rowsToCsv(["a"], [])).toBe("﻿a\r\n");
  });
});

// zip.test.ts
import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { buildZip } from "./zip";

describe("buildZip", () => {
  it("round-trips entries by name and content", () => {
    const zip = buildZip([
      { name: "konto.csv", content: "a\r\n1\r\n" },
      { name: "sitzungen.csv", content: "ä\r\n" },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(["konto.csv", "sitzungen.csv"]);
    expect(strFromU8(files["sitzungen.csv"]!)).toBe("ä\r\n");
  });
});
```

- [ ] **Step 2:** `pnpm exec vitest run apps/web/lib/data-export` — Expected: FAIL (Module fehlen).
- [ ] **Step 3: Implementieren**

```ts
// csv.ts
export type Row = Readonly<Record<string, unknown>>;

function cell(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) s = "";
  else if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /["\n\r,]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function rowsToCsv(columns: readonly string[], rows: readonly Row[]): string {
  const lines = [columns.map(cell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// zip.ts
import { strToU8, zipSync } from "fflate";

export type ZipEntry = { readonly name: string; readonly content: string };

export function buildZip(entries: readonly ZipEntry[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const e of entries) files[e.name] = strToU8(e.content);
  return zipSync(files);
}
```

Hinweis zum Formel-Guard: er verändert eine Zelle, die mit `-` beginnt (z. B. negative Zahl) bewusst zu `'-1` — gleiches Verhalten wie `roster-csv.ts`; im ADR vermerken.

- [ ] **Step 4:** Tests wie Step 2 — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/web/package.json pnpm-lock.yaml apps/web/lib/data-export
git commit -m "feat(web): CSV and ZIP builders for the data export"
```

---

### Task 5: Assembler — alle Kategorien, Manifest, Scoping-Vertrag

**Files:**

- Create: `apps/web/lib/data-export/assemble.ts`, `apps/web/lib/data-export/readers.ts`
- Test: `apps/web/lib/data-export/assemble.test.ts`

**Interfaces:**

- Consumes: `rowsToCsv`, `buildZip` (Task 4); `getUserExport`/`exportSessionsForUser` (`@bdas/auth`), `exportForUser as membersExport` (`@bdas/members`), `getProfile` (`@bdas/profile`), `exportParticipationForMember` (`@bdas/events-module`), `exportForUser` (`@bdas/files`, `@bdas/blog`, `@bdas/notifications`), `isFlagOn` (`@bdas/feature-flags`). Paketnamen vor dem Schreiben in den jeweiligen `package.json` prüfen (`@bdas/events-module` ist bestätigt, `@bdas/members` aus `apps/web/app/account/datenexport/route.ts`).
- Produces:

```ts
export type Principal = { readonly userId: string; readonly memberId: string | null };
export type Category = {
  readonly file: string;
  readonly columns: readonly string[];
  readonly rows: readonly Row[];
};
export type Readers = {
  readonly enabled: (flag: string) => boolean;
  readonly account: (userId: string) => Promise<Row | null>;
  readonly sessions: (userId: string) => Promise<readonly Row[]>;
  readonly member: (userId: string) => Promise<{
    member: Row | null;
    roleGrants: readonly Row[];
    groupChangeRequests: readonly Row[];
  }>;
  readonly profile: (userId: string) => Promise<Row | null>;
  readonly participation: (
    memberId: string,
  ) => Promise<{ registrations: readonly Row[]; attendance: readonly Row[] }>;
  readonly files: (userId: string) => Promise<readonly Row[]>;
  readonly blog: (userId: string) => Promise<{ posts: readonly Row[]; comments: readonly Row[] }>;
  readonly notifications: (userId: string) => Promise<readonly Row[]>;
};
export type DataExport = {
  readonly exportedAt: string;
  readonly categories: readonly Category[];
  readonly skipped: readonly { readonly category: string; readonly reason: string }[];
};
export async function buildDataExport(
  readers: Readers,
  principal: Principal,
  now?: Date,
): Promise<DataExport>;
export function toJson(e: DataExport): string;
export function toZip(e: DataExport): Uint8Array;
```

Kategorien und Dateinamen (fest): `konto.csv`, `sitzungen.csv`, `mitgliedschaft.csv`, `rollen.csv`, `gruppenwechsel.csv`, `profil.csv`, `veranstaltungen_anmeldungen.csv`, `veranstaltungen_anwesenheit.csv`, `dateien.csv`, `blog_beitraege.csv`, `blog_kommentare.csv`, `benachrichtigungen.csv`, plus `LIESMICH.txt` im ZIP mit `exportedAt`, Liste `skipped` und dem Hinweis, was bewusst fehlt (Gast-Anmeldungen, Dateiinhalte, fremde Ids). Spalten pro Kategorie = die Schlüssel der Typen aus Tasks 1–3 bzw. der bestehenden `FileExportRow`/`NotificationLogExportRow`/`MemberProfile`/`Post`/`Comment`. Flag-Zuordnung: `profile`→`profile`, `participation`→`events`, `files`→`files`, `blog`→`blog`, `notifications`→`notifications`; auth/members immer an (Voraussetzung der Route).

- [ ] **Step 1: Failing tests** — `assemble.test.ts`, mit einem Stub-`Readers`, dessen Funktionen ihre Aufrufargumente in einer Liste protokollieren:

```ts
import { describe, expect, it } from "vitest";
import { buildDataExport, toJson, toZip, type Readers } from "./assemble";
import { unzipSync, strFromU8 } from "fflate";

function stub(calls: string[], over: Partial<Readers> = {}): Readers {
  const rec =
    <T>(name: string, v: T) =>
    async (id: string): Promise<T> => {
      calls.push(`${name}:${id}`);
      return v;
    };
  return {
    enabled: () => true,
    account: rec("account", { id: "usr_me", email: "me@example.de" }),
    sessions: rec("sessions", [{ ip: "10.0.0.1" }]),
    member: rec("member", { member: { id: "mem_me" }, roleGrants: [], groupChangeRequests: [] }),
    profile: rec("profile", { studiengang: "Kath. Theologie" }),
    participation: rec("participation", { registrations: [{ eventTitle: "X" }], attendance: [] }),
    files: rec("files", []),
    blog: rec("blog", { posts: [], comments: [] }),
    notifications: rec("notifications", []),
    ...over,
  };
}

describe("buildDataExport", () => {
  it("calls every reader only with the principal's own ids", async () => {
    const calls: string[] = [];
    await buildDataExport(stub(calls), { userId: "usr_me", memberId: "mem_me" });
    expect(calls.sort()).toEqual(
      [
        "account:usr_me",
        "sessions:usr_me",
        "member:usr_me",
        "profile:usr_me",
        "participation:mem_me",
        "files:usr_me",
        "blog:usr_me",
        "notifications:usr_me",
      ].sort(),
    );
  });

  it("skips member-keyed readers when there is no member row and says so", async () => {
    const calls: string[] = [];
    const out = await buildDataExport(stub(calls), { userId: "usr_bare", memberId: null });
    expect(calls.some((c) => c.startsWith("participation"))).toBe(false);
    expect(out.skipped.map((s) => s.category)).toContain("veranstaltungen");
  });

  it("skips modules whose feature flag is off and lists them in the manifest", async () => {
    const out = await buildDataExport(stub([], { enabled: (f) => f !== "files" }), {
      userId: "usr_me",
      memberId: "mem_me",
    });
    expect(out.categories.map((c) => c.file)).not.toContain("dateien.csv");
    expect(out.skipped).toContainEqual({ category: "dateien", reason: "Modul nicht aktiv" });
  });

  it("emits a header-only CSV for an empty category (present, not forgotten)", async () => {
    const out = await buildDataExport(stub([]), { userId: "usr_me", memberId: "mem_me" });
    const zip = unzipSync(toZip(out));
    expect(strFromU8(zip["dateien.csv"]!)).toContain("filename");
    expect(strFromU8(zip["LIESMICH.txt"]!)).toContain("Gast");
  });

  it("toJson contains every category and no undeclared keys", async () => {
    const out = await buildDataExport(stub([]), { userId: "usr_me", memberId: "mem_me" });
    const parsed = JSON.parse(toJson(out)) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["categories", "exportedAt", "skipped"].sort());
  });
});
```

- [ ] **Step 2:** `pnpm exec vitest run apps/web/lib/data-export/assemble.test.ts` — Expected: FAIL (Modul fehlt).
- [ ] **Step 3: Implementieren** `assemble.ts` nach dem Interfaces-Block. Spalten sind pro Kategorie eine feste Konstante (nicht aus der ersten Zeile abgeleitet — sonst hätte eine leere Kategorie keine Kopfzeile). Die Namen stammen 1:1 aus den Typen der Module (`FileExportRow`, `NotificationLogExportRow`, `MemberProfile`, `Post`, `Comment`, Tasks 1–3, `UserExport`):

```ts
import { rowsToCsv, type Row } from "./csv";
import { buildZip } from "./zip";

type Spec = {
  readonly key: string; // Manifest-/Skip-Name
  readonly file: string;
  readonly flag: string | null; // null = immer an (auth/members)
  readonly columns: readonly string[];
};

const SPECS = {
  konto: {
    key: "konto",
    file: "konto.csv",
    flag: null,
    columns: ["id", "email", "status", "consentAt", "consentVersion", "createdAt", "updatedAt"],
  },
  sitzungen: {
    key: "sitzungen",
    file: "sitzungen.csv",
    flag: null,
    columns: ["createdAt", "expiresAt", "revokedAt", "ip", "userAgent"],
  },
  mitgliedschaft: {
    key: "mitgliedschaft",
    file: "mitgliedschaft.csv",
    flag: null,
    columns: [
      "id",
      "firstName",
      "lastName",
      "primaryGroupId",
      "status",
      "joinedAt",
      "createdAt",
      "updatedAt",
    ],
  },
  rollen: {
    key: "rollen",
    file: "rollen.csv",
    flag: null,
    columns: ["role", "groupId", "grantedAt", "revokedAt"],
  },
  gruppenwechsel: {
    key: "gruppenwechsel",
    file: "gruppenwechsel.csv",
    flag: null,
    columns: [
      "id",
      "fromGroupId",
      "toGroupId",
      "status",
      "requestedAt",
      "decidedAt",
      "reasonCategory",
      "reasonMessage",
    ],
  },
  profil: {
    key: "profil",
    file: "profil.csv",
    flag: "profile",
    columns: [
      "userId",
      "nutzertyp",
      "studiengang",
      "studienfachKategorie",
      "abschlussart",
      "uni",
      "geburtsdatum",
      "interesse",
      "bdajFunktion",
      "gefundenDurch",
      "empfehlerName",
      "vorstellung",
      "photoStorageKey",
      "completedAt",
      "updatedAt",
    ],
  },
  anmeldungen: {
    key: "veranstaltungen",
    file: "veranstaltungen_anmeldungen.csv",
    flag: "events",
    columns: [
      "registrationId",
      "eventId",
      "eventTitle",
      "eventStartsAt",
      "registeredAt",
      "cancelledAt",
      "waitlistPosition",
    ],
  },
  anwesenheit: {
    key: "veranstaltungen",
    file: "veranstaltungen_anwesenheit.csv",
    flag: "events",
    columns: ["eventId", "eventTitle", "eventStartsAt", "attended", "checkedInAt"],
  },
  dateien: {
    key: "dateien",
    file: "dateien.csv",
    flag: "files",
    columns: ["id", "folderId", "filename", "mimeType", "sizeBytes", "status", "uploadedAt"],
  },
  beitraege: {
    key: "blog",
    file: "blog_beitraege.csv",
    flag: "blog",
    columns: [
      "id",
      "slug",
      "title",
      "content",
      "visibility",
      "category",
      "createdBy",
      "createdAt",
      "updatedAt",
    ],
  },
  kommentare: {
    key: "blog",
    file: "blog_kommentare.csv",
    flag: "blog",
    columns: ["id", "postId", "authorId", "body", "createdAt"],
  },
  benachrichtigungen: {
    key: "benachrichtigungen",
    file: "benachrichtigungen.csv",
    flag: "notifications",
    columns: ["id", "channel", "template", "toEmail", "subject", "status", "error", "createdAt"],
  },
} as const satisfies Record<string, Spec>;

export async function buildDataExport(
  r: Readers,
  p: Principal,
  now: Date = new Date(),
): Promise<DataExport> {
  const skipped: { category: string; reason: string }[] = [];
  const on = (s: Spec): boolean => {
    if (s.flag !== null && !r.enabled(s.flag)) {
      if (!skipped.some((x) => x.category === s.key)) {
        skipped.push({ category: s.key, reason: "Modul nicht aktiv" });
      }
      return false;
    }
    return true;
  };
  const cat = (s: Spec, rows: readonly Row[]): Category => ({
    file: s.file,
    columns: s.columns,
    rows,
  });
  const categories: Category[] = [];

  const [account, sessions, member] = await Promise.all([
    r.account(p.userId),
    r.sessions(p.userId),
    r.member(p.userId),
  ]);
  categories.push(cat(SPECS.konto, account ? [account] : []));
  categories.push(cat(SPECS.sitzungen, sessions));
  categories.push(cat(SPECS.mitgliedschaft, member.member ? [member.member] : []));
  categories.push(cat(SPECS.rollen, member.roleGrants));
  categories.push(cat(SPECS.gruppenwechsel, member.groupChangeRequests));

  if (on(SPECS.profil)) {
    const profile = await r.profile(p.userId);
    categories.push(cat(SPECS.profil, profile ? [profile] : []));
  }
  if (on(SPECS.anmeldungen)) {
    if (p.memberId === null) {
      skipped.push({ category: "veranstaltungen", reason: "Kein Mitgliedseintrag" });
    } else {
      const part = await r.participation(p.memberId);
      categories.push(cat(SPECS.anmeldungen, part.registrations));
      categories.push(cat(SPECS.anwesenheit, part.attendance));
    }
  }
  if (on(SPECS.dateien)) categories.push(cat(SPECS.dateien, await r.files(p.userId)));
  if (on(SPECS.beitraege)) {
    const b = await r.blog(p.userId);
    categories.push(cat(SPECS.beitraege, b.posts));
    categories.push(cat(SPECS.kommentare, b.comments));
  }
  if (on(SPECS.benachrichtigungen)) {
    categories.push(cat(SPECS.benachrichtigungen, await r.notifications(p.userId)));
  }

  return { exportedAt: now.toISOString(), categories, skipped };
}

export function toJson(e: DataExport): string {
  return JSON.stringify(e, null, 2);
}

function readme(e: DataExport): string {
  const skipped = e.skipped.map((s) => `- ${s.category}: ${s.reason}`).join("\n") || "- keine";
  return [
    "BDAS-Datenauskunft (Art. 15 DSGVO)",
    `Erstellt am: ${e.exportedAt}`,
    "",
    "Übersprungene Kategorien:",
    skipped,
    "",
    "Bewusst nicht enthalten:",
    "- Gast-Anmeldungen zu Veranstaltungen (an eine E-Mail-Adresse, nicht an dein Konto gebunden)",
    "- Dateiinhalte (nur Metadaten; die Dateien selbst kannst du im Dateibereich herunterladen)",
    "- Kennungen anderer Personen (z. B. wer eine Rolle vergeben oder einen Antrag entschieden hat)",
    "",
  ].join("\r\n");
}

export function toZip(e: DataExport): Uint8Array {
  return buildZip([
    ...e.categories.map((c) => ({ name: c.file, content: rowsToCsv(c.columns, c.rows) })),
    { name: "LIESMICH.txt", content: readme(e) },
  ]);
}
```

Das Spec-Objekt `SPECS.anmeldungen`/`SPECS.anwesenheit` und `beitraege`/`kommentare` teilen bewusst `key` und `flag` — der Skip-Eintrag erscheint dadurch einmal pro Modul. Der Test „skips member-keyed readers" prüft `veranstaltungen`, der Flag-Test `dateien`.

`readers.ts` verdrahtet die echten Funktionen mit `getDb()`:

```ts
import { exportSessionsForUser, getUserExport } from "@bdas/auth";
import { exportForUser as blogExport } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { exportParticipationForMember } from "@bdas/events-module";
import { isFlagOn, type FlagName } from "@bdas/feature-flags";
import { exportForUser as filesExport } from "@bdas/files";
import { exportForUser as membersExport } from "@bdas/members";
import { exportForUser as notificationsExport } from "@bdas/notifications";
import { getProfile } from "@bdas/profile";

import type { Readers } from "./assemble";

export function realReaders(): Readers {
  const db = getDb();
  return {
    enabled: (flag) => isFlagOn(flag as FlagName),
    account: async (id) => (await getUserExport(db, id)) as Record<string, unknown> | null,
    sessions: (id) => exportSessionsForUser(db, id) as Promise<readonly Record<string, unknown>[]>,
    member: async (id) => {
      const m = await membersExport(db, id);
      return {
        member: m.member,
        roleGrants: m.roleGrants,
        groupChangeRequests: m.groupChangeRequests,
      };
    },
    profile: async (id) => (await getProfile(db, id)) as Record<string, unknown> | null,
    participation: (memberId) => exportParticipationForMember(db, memberId),
    files: (id) => filesExport(db, id) as Promise<readonly Record<string, unknown>[]>,
    blog: async (id) => {
      const b = await blogExport(db, id);
      return { posts: b.posts, comments: b.comments };
    },
    notifications: (id) =>
      notificationsExport(db, id) as Promise<readonly Record<string, unknown>[]>,
  };
}
```

`FlagName` und die exakten Paketnamen (`@bdas/blog`, `@bdas/profile`, …) vor dem Tippen mit `grep -n "\"name\"" modules/*/package.json core/feature-flags/package.json` bzw. `core/feature-flags/src/index.ts` gegenprüfen; falls der Typ dort anders heißt, den vorhandenen Namen verwenden. `readers.ts` hat keinen eigenen Test — Verkabelung wird durch `pnpm typecheck` (Typen der Modul-Rückgaben gegen `Readers`) und den Security-Review-Lauf abgedeckt; die Logik steckt in `assemble.ts`.

- [ ] **Step 4:** Tests — Expected: PASS (5 Tests).
- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/web/lib/data-export
git commit -m "feat(web): assemble the complete data export across all modules"
```

---

### Task 6: Route und E-Mail B

**Files:**

- Modify: `apps/web/app/account/datenexport/route.ts`
- Create: `apps/web/app/account/data-export-actions.ts` (liegt neben `delete-account-actions.ts`, gleiche Konvention)
- Test: `apps/web/app/account/data-export-actions.test.ts` — gemockter Unit-Test der Action-Verdrahtung, exakt der Stil von `delete-account-actions.test.ts` (die Modul-Funktionen haben ihre eigenen Postgres-Tests aus Tasks 1–3 und dem Assembler-Test)

**Interfaces:**

- Consumes: `realReaders`, `buildDataExport`, `toJson`, `toZip` (Task 5); `getCurrentMember` (`@bdas/members`); `sendTransactional`, `sendTransactionalToGuest` (`@bdas/notifications`); `requireFlag`/`isFlagOn` (`@bdas/feature-flags`). `attachments`-Feld existiert bereits im Notifier-Pfad (`Extra.attachments`, `send.ts`; Form `{ filename, content: Buffer }` laut `notifications/src/index.test.ts:134`).
- Produces: `GET /account/datenexport` (JSON, gleicher Pfad wie heute), `GET /account/datenexport?format=zip` (`Content-Disposition: attachment; filename="bdas-datenexport.zip"`, `Cache-Control: no-store`, nur wenn `account_deletion` an, sonst 404 wie andere flag-gesteuerte Routen), und

```ts
export type SendDataExportState = { readonly ok?: true; readonly error?: string };
export async function sendDataExportAction(): Promise<SendDataExportState>;
```

- [ ] **Step 1: Failing tests** — `data-export-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentMember } from "@bdas/members";

const sendTransactional = vi.fn();
const sendTransactionalToGuest = vi.fn();
const buildDataExport = vi.fn();
let currentMember: CurrentMember | null = null;

vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("@bdas/feature-flags", () => ({ requireFlag: () => {} }));
vi.mock("@bdas/members", () => ({ getCurrentMember: async () => currentMember }));
vi.mock("@bdas/notifications", () => ({
  sendTransactional: (...a: unknown[]) => sendTransactional(...a),
  sendTransactionalToGuest: (...a: unknown[]) => sendTransactionalToGuest(...a),
}));
vi.mock("../../lib/notifications-bootstrap", () => ({ bootNotifications: () => {} }));
vi.mock("../../lib/auth-cookie", () => ({ readSessionCookie: () => undefined }));
vi.mock("../../lib/data-export/readers", () => ({ realReaders: () => ({}) }));
vi.mock("../../lib/data-export/assemble", () => ({
  buildDataExport: (...a: unknown[]) => buildDataExport(...a),
  toZip: () => new Uint8Array([80, 75, 3, 4]),
}));

import { sendDataExportAction } from "./data-export-actions";

function me(overrides: Partial<CurrentMember> = {}): CurrentMember {
  return {
    user: {
      id: "usr_1",
      email: "mara@example.org",
      status: "active",
      roles: [],
      sessionId: "ses_1",
    },
    member: {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "Mara",
      lastName: "Beispiel",
      primaryGroupId: null,
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    grants: [],
    primaryGroupKind: null,
    hasGroupScope: false,
    isBdasMember: true,
    ...overrides,
  };
}

describe("sendDataExportAction", () => {
  beforeEach(() => {
    sendTransactional.mockReset().mockResolvedValue({ status: "sent", logId: "n1" });
    sendTransactionalToGuest.mockReset().mockResolvedValue({ status: "sent", logId: "n2" });
    buildDataExport.mockReset().mockResolvedValue({ exportedAt: "x", categories: [], skipped: [] });
    currentMember = me();
  });

  it("requires an authenticated session and sends nothing without one", async () => {
    currentMember = null;

    expect(await sendDataExportAction()).toEqual({ error: "Anmeldung erforderlich." });
    expect(sendTransactional).not.toHaveBeenCalled();
    expect(sendTransactionalToGuest).not.toHaveBeenCalled();
    expect(buildDataExport).not.toHaveBeenCalled();
  });

  it("builds the export for the session principal only and mails it as an attachment to the member", async () => {
    const res = await sendDataExportAction();

    expect(res).toEqual({ ok: true });
    expect(buildDataExport).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      memberId: "mbr_1",
    });
    expect(sendTransactional).toHaveBeenCalledWith(
      expect.anything(),
      "data_export_ready",
      "mbr_1",
      expect.objectContaining({
        attachments: [expect.objectContaining({ filename: "bdas-datenexport.zip" })],
      }),
    );
  });

  it("falls back to the account address when there is no member row", async () => {
    currentMember = me({ member: null });

    const res = await sendDataExportAction();

    expect(res).toEqual({ ok: true });
    expect(buildDataExport).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      memberId: null,
    });
    expect(sendTransactional).not.toHaveBeenCalled();
    expect(sendTransactionalToGuest).toHaveBeenCalledWith(
      expect.anything(),
      "data_export_ready",
      { email: "mara@example.org", name: null },
      expect.objectContaining({
        attachments: [expect.objectContaining({ filename: "bdas-datenexport.zip" })],
      }),
    );
  });

  it("reports a failed send instead of claiming success", async () => {
    sendTransactional.mockResolvedValue({ status: "failed", logId: "n3" });

    expect(await sendDataExportAction()).toEqual({
      error: "Die E-Mail konnte nicht verschickt werden. Bitte versuche es später erneut.",
    });
  });
});
```

- [ ] **Step 2:** `pnpm exec vitest run apps/web/app/account/data-export-actions.test.ts` — Expected: FAIL (Modul `./data-export-actions` fehlt).
- [ ] **Step 3: Implementieren** `apps/web/app/account/data-export-actions.ts`:

```ts
"use server";

import { getDb } from "@bdas/db";
import { requireFlag } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { sendTransactional, sendTransactionalToGuest } from "@bdas/notifications";

import { readSessionCookie } from "../../lib/auth-cookie";
import { buildDataExport, toZip } from "../../lib/data-export/assemble";
import { realReaders } from "../../lib/data-export/readers";
import { bootNotifications } from "../../lib/notifications-bootstrap";

export type SendDataExportState = {
  readonly ok?: true;
  readonly error?: string;
};

export async function sendDataExportAction(): Promise<SendDataExportState> {
  requireFlag("auth");
  requireFlag("account_deletion");
  bootNotifications();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return { error: "Anmeldung erforderlich." };

  // The principal comes from the session only — this action takes no argument.
  const data = await buildDataExport(realReaders(), {
    userId: me.user.id,
    memberId: me.member?.id ?? null,
  });
  const attachments = [{ filename: "bdas-datenexport.zip", content: Buffer.from(toZip(data)) }];

  const result = me.member
    ? await sendTransactional(db, "data_export_ready", me.member.id, { attachments })
    : await sendTransactionalToGuest(
        db,
        "data_export_ready",
        { email: me.user.email, name: null },
        { attachments },
      );

  if (!result || result.status !== "sent") {
    return { error: "Die E-Mail konnte nicht verschickt werden. Bitte versuche es später erneut." };
  }
  return { ok: true };
}
```

`sendTransactional` liefert `null`, wenn der Empfänger nicht auflösbar ist — auch das wird als Fehler gemeldet. Route `datenexport/route.ts`: bisherige Payload-Felder (`account`, `profile: me.member`, `profileData`, `roleGrants`) durch

```ts
const data = await buildDataExport(realReaders(), {
  userId: me.user.id,
  memberId: me.member?.id ?? null,
});
if (new URL(request.url).searchParams.get("format") === "zip") {
  if (!isFlagOn("account_deletion")) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(toZip(data), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="bdas-datenexport.zip"',
      "Cache-Control": "no-store",
    },
  });
}
return new NextResponse(toJson(data), {
  /* bisherige JSON-Header unverändert */
});
```

ersetzen (`GET(request: Request)` — Signatur erweitern; `me`-Herkunft und Redirect auf `/anmelden` bleiben unverändert, ebenso `requireAuthFlag()`/`requireMembersFlag()`), und den Docstring von „Phase-1 stub" auf „alle Module" aktualisieren.

- [ ] **Step 4:** `pnpm exec vitest run apps/web/app/account/data-export-actions.test.ts` — Expected: PASS (4 Tests). Danach `pnpm --filter @bdas/web build` — Expected: Build ok (fängt Typfehler in Route/Readers).
- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/web/app/account
git commit -m "feat(web): ZIP download and e-mail B delivery of the data export"
```

---

### Task 7: UI, Doku, ADR, Abschluss

**Files:**

- Modify: `apps/web/app/account/einstellungen/page.tsx:68-76`
- Create: `docs/decisions/0054-datenexport-csv-zip.md`
- Modify: `modules/events/README.md`, `modules/members/README.md`, `modules/auth/README.md`

- [ ] **Step 1: UI** — die „Deine Daten"-Card: Text „Export aller zu dir gespeicherten Daten (Art. 15/20 DSGVO)." Beim bestehenden Link „Als JSON" beibehalten; bei `accountDeletionEnabled()` zusätzlich Link `…/datenexport?format=zip` („Als CSV-ZIP") und die Client-Komponente `SendDataExportButton` („Per E-Mail zusenden"), die `sendDataExportAction()` aufruft und `ok` als „Die Auskunft ist unterwegs — schau in dein Postfach." bzw. `error` anzeigt. Aufbau (`useState` + `useTransition`, `Button variant="secondary"`, Meldung in der vorhandenen Meldungs-Komponente der Seite) 1:1 nach `DeleteAccountCard.tsx` lesen und übernehmen; keine Inline-Farben/Radien/Dauern.
- [ ] **Step 2: ADR 0054** — Entscheidung: JSON bleibt, ZIP mit einer CSV je Kategorie, `fflate` (Begründung + Alternative), Scoping-Regel „nur Session-Prinzipal", Ausschlussliste (fremde Ids, Session-Id, Tokens, Storage-Keys, Gast-Anmeldungen, Dateiinhalte), Formel-Guard-Verhalten, E-Mail B auf Abruf ohne Drosselung (D4), Religion nicht gespeichert.
- [ ] **Step 3: READMEs** — pro Modul die neue öffentliche Funktion und ihre Ausschlüsse eintragen.
- [ ] **Step 4: Gesamtlauf**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: alles grün, Docker-Postgres läuft (sonst laufen die `describeIfDb`-Tests nur als `skipped` — dann ausdrücklich Docker starten; ein skipped-Lauf zählt nicht als grün, das war genau die Ursache der PR6-Verwechslung).

- [ ] **Step 5: Plan/Spec archivieren** — `git mv docs/superpowers/plans/2026-09-24-account-deletion-pr7-export.md docs/archive/superpowers/plans/` nach Grep der ADRs/READMEs auf den Dateinamen; Spec bleibt (PR8/9 nutzen sie noch).
- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "docs(export): ADR 0054, module READMEs, archive PR7 plan"
```

- [ ] **Step 7:** `/security-review` auf dem Branch, danach `/review`. Prüfpunkte für das Security-Review: kein id-Parameter irgendwo im Pfad Route → Assembler → Modul; `me` ausschließlich aus `getCurrentMember(db, readSessionCookie())`; keine fremden Ids/Tokens im JSON und in jeder CSV (Test: `JSON.stringify` der Ausgaben gegen zwei Nutzer); E-Mail-Empfänger ist immer die Adresse des Session-Kontos; ZIP-Download ohne Session → Redirect statt Datei; `Cache-Control: no-store` auch auf der ZIP-Antwort.

---

## Self-Review

- **Spec §6 / harte Anforderungen:** Anmeldungen + Anwesenheit → Task 1 (+ Kategorien in Task 5). members/profile/auth/sessions/group-change-requests → Task 2 (members, Rollen, Gruppenwechsel), Task 3 (sessions), profile über `getProfile` in Task 5, auth über bestehendes `getUserExport`. CSV-ZIP je Kategorie → Task 4/5. E-Mail B mit Anhang → Task 6 (das `attachments`-Feld existiert bereits seit PR2 — der Memory-Eintrag „Notifier attachments field in PR7" ist damit überholt und wird korrigiert).
- **Placeholders:** Tasks 1–6 enthalten Tests und Implementierung als Code. Bewusst nicht ausgeschrieben: Task 3 Step 1 (Migrationsliste im `beforeEach` wird aus dem vorhandenen `describeIfDb` derselben Datei kopiert), Task 7 UI-JSX (Vorlage `DeleteAccountCard.tsx`), ADR-/README-Prosa. `readers.ts` hat keinen eigenen Test (Begründung dort).
- **Bekannte Unschärfen zur Prüfung beim Bauen:** Paketname/Typ `FlagName` in `@bdas/feature-flags`; genaue Paketnamen `@bdas/blog`, `@bdas/profile`; ob `getUserExport` die Spalte `consentAt` als `Date | null` liefert (ja laut `UserExport`), CSV-Konvertierung übernimmt `Date`.
- **Typ-Konsistenz:** `Principal { userId, memberId }`, `Readers`, `Category`, `DataExport` in Task 5 definiert und in Task 6 unverändert genutzt; `ParticipationExport`, `MemberExport`, `SessionExport` stammen aus Tasks 1–3.
- **Review Focus:** Fall 1 → Task 5 (Test „ohne Mitgliedszeile") + Task 6; Fall 2 → Task 5 (Flag-Test); Fall 3 → Task 4; Fall 4 → Task 5 (Header-only-Test); Fall 5 → Task 6.

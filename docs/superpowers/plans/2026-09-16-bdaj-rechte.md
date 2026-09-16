# BDAJ-Funktionär\*innen — Umsetzungsplan (Rechte-Teil)

**Date:** 2026-09-16
**Ersetzt:** den Plan vom 2026-09-09 (nur auf `feat/group-page-files-section`, nie gemergt)
**Spec:** [`2026-09-07-bdaj-funktionaere-design.md`](../specs/2026-09-07-bdaj-funktionaere-design.md), korrigiert durch [ADR 0047](../../decisions/0047-bdaj-rechte-zuschnitt.md)
**Baut auf:** Nutzertypen-Fundament I + II (ADR 0043, 0045, 0046)

## Ausgangslage

Seit dem Fundament steht auf `main` bereits:

- `groups.kind` mit `affiliate`, Stadt nur bei Hochschulgruppen (`groups` 0007/0008)
- `CurrentMember.hasGroupScope` und `isBdasMember`
- `grantRole` verweigert `local_board_lead` auf jeder Nicht-Hochschulgruppe
- `provisionGroupFolders` legt für `affiliate` keine Ordner an
- Ordnerfreigabe pro Person (`files` 0005, `grantFolderAccess`/`revokeFolderAccess`/`listFolderAccess`), wirkt in `canRead`/`canWrite`, gilt für Unterordner mit
- Der Bundesvorstand sieht jede aktive Gruppe als Vorstands-Scope und kann dort `event_organizer` und `blogger` vergeben

Die PRs 1–3 des alten Plans sind damit großenteils erledigt.

## Nicht in diesem Plan

**Der Einstieg.** Wie eine BDAJ-Person auf die Plattform kommt, baut die neue Registrierung
(Entscheidung des Nutzers, 2026-09-16). Bis dahin entsteht kein BDAJ-Account; alles hier ist
bis dahin wirkungslos, aber getestet. Das ersetzt das Feature-Flag aus dem alten Plan: es gibt
kein neues Modul und keinen neuen öffentlichen Einstieg, den ein Flag abschirmen müsste.

Ebenfalls nicht: ein Mitgliederverzeichnis (existiert nicht), E2E-Test des Gesamtablaufs (braucht
den Einstieg — kommt mit der Registrierung).

## PRs

Alle auf `main`, unabhängig voneinander mergebar, in dieser Reihenfolge geplant.

### PR 1 — Grundlage: Plan, ADR 0047, BDAJ-Gruppe

- Dieser Plan, ADR 0047, Statusvermerk in der Spec.
- `infra/seeds/groups.json`: Eintrag `{ slug: "bdaj", name: "BDAJ", kind: "affiliate", status: "active" }`.
  `pnpm groups:seed` legt ihn an (idempotent, manuell, kein CI-Job).

### PR 2 — `events`: nur eigene Veranstaltungen ohne Hochschulgruppe

- `Viewer` bekommt `userId: string | null` und `ownEventsOnly: boolean`.
- `canManage(v, event)` verlangt `groupId` **und** `createdBy`. Greift nur die Event-Manager-Rolle
  und ist `ownEventsOnly` gesetzt, muss `event.createdBy === v.userId` gelten. Bundesvorstand und
  Lead bleiben unverändert.
- Neu `canCreateFor(v, groupId)` — die bisherige Gruppenprüfung, für das Anlegen und das Ziel
  einer Änderung (`groupAuthError`).
- `viewerFrom` (App): `userId = me.user.id`, `ownEventsOnly = !me.hasGroupScope`.
- Tests (`modules/events`, rein): Event-Manager ohne Hochschulgruppe verwaltet eigenes Event,
  fremdes der gleichen Gruppe nicht; mit Hochschulgruppe weiterhin alle; Bundesvorstand/Lead
  unverändert. App-Test für `viewerFrom`.

### PR 3 — Blog: Event-Manager-Rolle schaltet für Nicht-Mitglieder keinen Blog frei

- `apps/web/app/_blog/access.ts` `canAuthorPost`: `event_organizer` zählt nur mit
  `hasGroupScope`. `blogger`, Lead und Bundesvorstand unverändert.
- Tests: Affiliate mit `event_organizer` → nein; mit `blogger` → ja; Hochschulgruppen-Mitglied
  mit `event_organizer` → weiterhin ja.

### PR 4 — `files`: Rechte einer Freigabe, Freigabe-Oberfläche (`/security-review`)

Verhalten:

- Neu `canManage(folder, me)` = die Scope-Regel des Schreibrechts **ohne** persönliche Freigabe.
  Ordner anlegen, umbenennen, löschen verlangt `canManage`. Eine Freigabe mit Schreibrecht erlaubt
  also Hochladen, aber keine Ordnerverwaltung (Spec §4.5).
- `deleteFile`: erlaubt mit `canManage`, sonst nur mit Schreibrecht **und** eigener Datei
  (`uploadedBy === member.id`).
- Neu `getFolderRights(db, folderId, me)` → `{ canUpload, canManage }` für die Seiten. Die drei
  Ordnerseiten nutzen es statt `canWriteFolder(folder, me)`, das die Freigaben nicht kennt;
  `FileRow` zeigt „Löschen" nur bei `canManage` oder eigener Datei.
- `/dateien` zeigt als Einstieg jeden lesbaren Ordner, dessen Elternordner nicht lesbar ist —
  sonst bleibt eine Freigabe auf einen Unterordner unsichtbar.

Oberfläche (Bundesvorstand):

- `/federal/files/freigaben`: Tabelle der offenen Freigaben (Person, Gruppe, Ordnerpfad,
  lesen/hochladen, entziehen) und ein Formular (Person, Ordner, „darf hochladen").
- Personen zur Auswahl: aufgenommene Accounts aller `affiliate`-Gruppen.
- Ordner zur Auswahl: alle Ordner mit Pfad. Der Bundesvorstand kann fremde Mitgliederordner
  nicht öffnen, muss sie aber freigeben können — daher eine eigene Seite statt eines Abschnitts
  auf der Ordnerseite.
- Neue Services, nur Bundesvorstand: `listAllFolderGrants`, `listFolderTree`.
- Link von `/federal/files`.

Tests (Docker-Postgres): Freigabe mit Schreibrecht lädt hoch, löscht eigene Datei, keine fremde,
legt keinen Unterordner an, benennt nicht um; Scope-Schreibrecht unverändert; die neuen Services
verweigern jedem außer dem Bundesvorstand. App-Test für die Einstiegsordner.

### PR 5 — Anzeige

- `/account`: aufgenommener Account einer `affiliate`-Gruppe heißt „Partnerorganisation",
  die Gruppenzeile („BDAJ") bleibt. Bisher stand dort „Warten auf Beitritt".
- `/gruppe/[slug]/vorstand`: auf einer Nicht-Hochschulgruppe nur „Event-Manager" und „Blogger"
  anbieten. Seiten-Editor und Datei-Manager haben dort keinen Gegenstand (keine öffentliche Seite,
  keine Gruppenordner).
- Tests: `statusText`, Rollen-Optionen.

## Danach (Registrierungsblock)

- Einstieg für BDAJ-Personen, Antrag an die BDAJ-Gruppe, über den der Bundesvorstand entscheidet
  (ADR 0021-Rückfall — funktioniert heute schon, weil die Gruppe keinen Lead haben kann).
- Profil-Schritt ohne Hochschulgruppen-Pflicht für diesen Typ.
- E2E: Registrierung → Aufnahme → Freigaben → Rechte.

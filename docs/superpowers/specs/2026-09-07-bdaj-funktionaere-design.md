# BDAJ-Funktionäre als Plattform-Nutzer — Design

**Date:** 2026-09-07
**Status:** Approved (brainstorming)
**Scope:** Selbst-Registrierung + Bundesvorstand-Freigabe für BDAJ-Funktionär\*innen (Bund der Alevitischen Jugendlichen — eigenständige, mit dem BDAS eng verbundene Organisation, keine BDAS-Mitglieder). Individuell zuschaltbare Rechte für Events, Blog und Dateien; grundsätzlich beschränkt auf eigene Inhalte. Betrifft `groups`, `members`, `events`, `files`, `blog`.

---

## 1. Context and decisions

Die Plattform kennt heute nur zwei Nutzerklassen: nicht angemeldete Besucher\*innen und BDAS-Mitglieder (`members`, mit `primary_group_id` in eine Hochschulgruppe). BDAJ ist bisher ausschließlich eine öffentliche Info-Seite (`/ueber-uns/bdaj`, ADR 0024) — keine Nutzergruppe.

BDAJ-Funktionär\*innen sind keine BDAS-Mitglieder, sollen aber einen Account bekommen: Basis-Lesezugriff, plus vom Bundesvorstand individuell zuschaltbare Rechte (Events anlegen, Blog schreiben, an Dateien mitarbeiten). Manche Funktionäre gehören lokalen/regionalen BDAJ-Verbänden an, die mit bestimmten BDAS-Gruppen zusammenarbeiten — der Dateizugriff muss deshalb pro Ordner wählbar sein, nicht pauschal.

**Kernentscheidung: BDAJ wird eine einzelne, besonders markierte Zeile in `groups`** (`kind = 'affiliate'`), statt eines neuen Members-Felds oder eines eigenen Moduls. Das ist die kleinste Änderung, weil sich die bestehende Genehmigungs-, Grant- und Sichtbarkeits-Maschinerie fast unverändert wiederverwenden lässt:

- **Freigabe fällt automatisch dem Bundesvorstand zu** — eine Gruppe ohne eigenes lokales Board eskaliert laut ADR 0021 bereits an den Bundesvorstand. Für die BDAJ-Gruppe wird das erzwungen (§3), nicht nur erhofft.
- **Sichtbarkeit "mit Kennzeichnung"** ergibt sich kostenlos aus der Gruppenzugehörigkeit — überall, wo heute der Gruppenname angezeigt wird, steht "BDAJ".
- **`event_organizer`** (ADR 0017) ist bereits gruppen-scoped — für BDAJ wird der bestehende Grant-Typ wiederverwendet, nur auf die BDAJ-Gruppe gescoped.

Bewusst **kein** neues `members.kind`-Feld: "ist Affiliate" wird immer aus `primary_group.kind` abgeleitet — eine Quelle der Wahrheit.

Verworfene Alternativen:

- **Discriminator direkt auf `members`, `primary_group_id` nullable:** konzeptionell sauberer, aber jede Modul-Grenze (Events, Blog, Files, Verzeichnis) bräuchte einen eigenen neuen Sonderfall für "ungescoped, aber kein Bundesvorstand", statt die bestehende Scoping-Maschinerie zu erben.
- **Eigenes Modul (`modules/affiliates`):** sauberste Trennung im Sinne von CLAUDE.md §1, aber dupliziert Registrierung, Pending-Queue, Grant-CRUD und Verzeichnis-Logik für eine Handvoll Accounts — Overengineering für diese Größenordnung.

## 2. Goals and non-goals

**Goals**

- BDAJ-Funktionär\*in registriert sich selbst über einen eigenen Einstiegspunkt, landet als `pending`.
- Bundesvorstand genehmigt (bestehender Approval-Mechanismus, kein neuer Code für den Genehmigungsschritt selbst).
- Nach Freigabe: Basis-Lesezugriff, keine Schreibrechte.
- Bundesvorstand kann pro Person einzeln zuschalten: Events anlegen, Blog schreiben, Zugriff auf bestimmte (auch lokale/regionale BDAS-) Dateiordner.
- In allen drei Bereichen: Bearbeiten/Löschen ausschließlich eigener Inhalte — nie fremder, unabhängig vom sonst gewährten Recht.
- BDAJ-Funktionär\*innen erscheinen im Verzeichnis, klar als BDAJ gekennzeichnet.

**Non-goals**

- Keine lokale/regionale BDAJ-Untergliederung als eigene Gruppen — eine einzige `affiliate`-Gruppe "BDAJ".
- Kein Local Board für die BDAJ-Gruppe (§3).
- Keine Vererbung von Dateizugriff auf Unterordner beim Checkbox-Grant.
- Keine Beitrags-/Alumni-/Exmatrikulations-Logik für Affiliates — diese Übergänge (`alumnus`, `changePrimaryGroup`) bleiben ungenutzt für diese Gruppe; nicht aktiv verboten, aber ohne UI-Pfad.
- Keine Ordner-Erstellung/-Löschung durch Affiliates.

## 3. Data model

### 3.1 `groups.kind`

```sql
ALTER TABLE groups
  ADD COLUMN kind text NOT NULL DEFAULT 'hochschulgruppe';

ALTER TABLE groups
  ADD CONSTRAINT groups_kind_check
  CHECK (kind IN ('hochschulgruppe', 'affiliate'));

-- city ist heute NOT NULL; affiliate-Gruppen haben keine Stadt.
ALTER TABLE groups ALTER COLUMN city DROP NOT NULL;
ALTER TABLE groups
  ADD CONSTRAINT groups_affiliate_city_check
  CHECK (kind = 'hochschulgruppe' OR city IS NULL);
```

Eine einzige Zeile wird angelegt (Seed, nicht Migration-Backfill): `slug = 'bdaj'`, `name = 'BDAJ'`, `kind = 'affiliate'`, `city = NULL`.

### 3.2 `member_role_grants` — neuer Wert `blog_author`

Gleiches Drop+Recreate-Muster wie `event_organizer` (0005) / `page_editor` (0007):

```sql
ALTER TABLE member_role_grants DROP CONSTRAINT member_role_grants_role_check;
ALTER TABLE member_role_grants
  ADD CONSTRAINT member_role_grants_role_check
  CHECK (role IN ('member', 'local_board', 'local_board_lead', 'federal_board',
                   'alumnus', 'event_organizer', 'page_editor', 'blog_author'));
```

`blog_author` ist ungescoped (`group_id = NULL`), analog zu `federal_board`/`alumnus`. `event_organizer` scoped auf die BDAJ-Gruppe deckt den Events-Schalter ab — kein neuer Grant-Typ nötig.

### 3.3 `member_folder_access` (neu, im `files`-Modul)

```sql
CREATE TABLE member_folder_access (
  id          text PRIMARY KEY,
  member_id   text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  folder_id   text NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  granted_by  text NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
CREATE UNIQUE INDEX member_folder_access_active_uq
  ON member_folder_access (member_id, folder_id)
  WHERE revoked_at IS NULL;
```

Eigenständiger Mechanismus, unabhängig vom bestehenden 4-Scope-Wurzelordner-Modell (`members_all` / `group_members:[g]` / `local_board:[g]` / `federal_board`). Gilt nur für `kind = 'affiliate'`-Mitglieder; für reguläre BDAS-Mitglieder ändert sich am Scope-Modell nichts. Zugriff gilt nur für den konkret ausgewählten Ordner, keine Vererbung auf Unterordner.

## 4. Enforcement

### 4.1 `isAffiliate` als zentrales Flag

`getCurrentMember()` (`@bdas/members`) liefert zusätzlich `isAffiliate: boolean`, abgeleitet aus `primary_group.kind === 'affiliate'`. Das ist der einzige Ort, an dem "ist BDAJ-Funktionär" bestimmt wird — Events, Files und Blog fragen nur dieses Flag ab, keine eigene Gruppen-Kind-Logik.

### 4.2 Kein Local Board auf einer `affiliate`-Gruppe

`grantRole()` wirft, wenn `role IN ('local_board', 'local_board_lead')` und die Ziel-Gruppe `kind = 'affiliate'` ist. Das schützt den ADR-0021-Fallback (Bundesvorstand genehmigt immer), der sonst durch ein versehentlich vergebenes lokales Board unterlaufen würde.

### 4.3 Events

- **Anlegen:** bestehender Check "ist `event_organizer` im Scope der Event-Gruppe" — unverändert, nur mit `group_id = BDAJ` als möglichem Scope.
- **Bearbeiten/Löschen/Stornieren:** bestehender Check bleibt Voraussetzung, UND — wenn `isAffiliate` — zusätzlich `event.created_by === actor.memberId`. Ein BDAJ-Funktionär mit `event_organizer` kann also nur eigene Events verwalten, nicht die anderer BDAJ-Funktionäre (anders als das heutige Verhalten für BDAS-Lokalgruppen, wo `event_organizer` alle Events der Gruppe verwaltet — das bleibt für `hochschulgruppe`-Scopes unverändert).

### 4.4 Blog

`canAuthor()` (ADR 0030) erweitert sich:

```
canAuthor(member) =
  (member.status IN ('active', 'alumnus') AND !member.isAffiliate)
  OR (member.isAffiliate AND hasGrant(member, 'blog_author'))
```

Löschen/Bearbeiten bleibt unverändert "Autor oder Bundesvorstand moderiert" (ADR 0030) — für Affiliates ist das bereits "nur eigenes", da sie nie `federal_board` halten.

### 4.5 Files

- **Lesen/Schreiben (Upload):** für `isAffiliate`-Mitglieder ersetzt eine aktive `member_folder_access`-Zeile für den Ziel-Ordner die üblichen vier Root-Scopes.
- **Löschen:** zusätzlich zur Zugriffsprüfung gilt `file.uploaded_by === actor.memberId`.
- **Ordner anlegen/umbenennen/löschen:** für `isAffiliate`-Mitglieder grundsätzlich nicht erlaubt, unabhängig von `member_folder_access`.

## 5. Registration flow

Eigener Einstiegspunkt (z. B. `/account/bdaj-registrierung`), getrennt vom normalen Hochschulgruppen-Dropdown in der regulären Registrierung — verhindert, dass ein BDAS-Studi versehentlich "BDAJ" als Hochschulgruppe wählt. Formular: Name, E-Mail, Passwort — kein Uni-/Studienfach-Feld (bei `createProfile` für diesen Pfad nicht abgefragt bzw. nicht relevant). `primary_group_id` wird serverseitig fix auf die BDAJ-Gruppe gesetzt, nicht wählbar.

Ergebnis: `members`-Zeile mit `status = 'pending'`, `primary_group_id = BDAJ`. Ab hier läuft alles über bestehende Mechanik: `listPendingMembers` zeigt sie dem Bundesvorstand (Fallback nach ADR 0021, da keine `local_board`-Zeile existieren kann, §4.2), `approveMember` setzt `active`.

Nach Freigabe schaltet der Bundesvorstand über die bestehende Rollenverwaltung die gewünschten Grants frei (`event_organizer` scoped BDAJ, `blog_author` unscoped) und wählt im Dateien-Bereich die freizugebenden Ordner aus.

## 6. Directory / visibility

BDAJ-Funktionär\*innen erscheinen im allgemeinen (Mitglieder-)Verzeichnis wie jede andere Gruppe, mit "BDAJ" als Gruppenname sichtbar — kein Sonderfall in der Verzeichnis-Query nötig, da sie regulär `primary_group_id = BDAJ` haben.

**Öffentliche Gruppenseiten sind der eine Sonderfall.** `/gruppen` (Verzeichnis) und `/gruppen/[slug]` (Profilseite) sind generische, öffentliche Routen über `listGroups`/`getGroup` (spec §9) — ohne Filter würde die BDAJ-Zeile dort als vermeintliche Hochschulgruppe auftauchen und mit der bestehenden, Puck-verwalteten `/ueber-uns/bdaj`-Seite (ADR 0024) kollidieren. Beide Routen filtern deshalb auf `kind = 'hochschulgruppe'`: `/gruppen` listet keine `affiliate`-Gruppen, `/gruppen/bdaj` liefert 404. Der öffentliche Gruppen-Karte-Layer (ADR 0019) filtert ebenso — eine Gruppe ohne `city`/Standort hätte dort ohnehin nichts anzuzeigen.

## 7. Migrations

| Modul     | Datei                            | Inhalt                                                |
| --------- | --------------------------------- | ------------------------------------------------------ |
| `groups`  | `NNNN_affiliate_kind.sql`        | `kind`-Spalte + Check, `city` nullable + Check         |
| `members` | `0010_blog_author.sql`           | `blog_author` in `member_role_grants_role_check`       |
| `files`   | `NNNN_member_folder_access.sql`  | neue Tabelle `member_folder_access`                    |

Seed (nicht Migration): eine `groups`-Zeile `slug='bdaj', kind='affiliate'`.

## 8. Testing

- Integration: `grantRole('local_board', bdajGroupId, ...)` wirft.
- Integration: `getCurrentMember()` liefert `isAffiliate: true` für ein Mitglied mit `primary_group_id = BDAJ`.
- Events: Affiliate mit `event_organizer` kann eigenes Event löschen, fremdes BDAJ-Event nicht.
- Blog: Affiliate ohne `blog_author` kann nicht posten; mit Grant schon; kann fremden Post nicht löschen.
- Files: Affiliate ohne `member_folder_access`-Zeile für Ordner X sieht/schreibt dort nichts; mit Zeile kann hochladen; kann fremde Datei im selben Ordner nicht löschen; kann keinen Unterordner anlegen.
- E2E: Registrierung über `/account/bdaj-registrierung` → `pending` → Bundesvorstand genehmigt → Login zeigt Lesezugriff, keine Schreibrechte bis Grants gesetzt sind.
- `/gruppen` enthält keine BDAJ-Zeile; `/gruppen/bdaj` liefert 404.

## 9. Open questions

Keine offenen Punkte — alle Entscheidungen in diesem Dokument wurden im Brainstorming bestätigt.

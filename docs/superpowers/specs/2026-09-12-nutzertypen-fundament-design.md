# Nutzertypen-Fundament: Alumnus als Rolle, `groups.kind` als Achse — Design

**Date:** 2026-09-12
**Status:** Approved (brainstorming)
**Scope:** Zwei unabhängige PRs. **PR A** macht `alumnus` zu einer reinen Rolle und streicht den Status `inactive`; `MemberStatus` schrumpft auf `pending | active`. **PR B** führt `groups.kind` als Achse für Accounts ohne Hochschulgruppen-Scope ein und ist das Fundament für die bereits genehmigte BDAJ-Spec sowie für weitere Partnerorganisationen. Betrifft `members`, `groups`, und lesend `blog`.

---

## 1. Kontext

Die Plattform kennt heute zwei Nutzerklassen mit Account: BDAS-Mitglieder und (auf dem Papier) BDAJ-Funktionär\*innen. Die Frage „welche Nutzertypen brauchen wir zusätzlich" hat vier Kandidaten ergeben — BDAJ-Funktionär\*innen, weitere Partnerorganisationen, Alumni und Interessierte ohne Hochschulgruppe. Die Analyse hat gezeigt, dass diese vier nicht vier Features sind, sondern zwei Fragen:

1. **Alumni sind keine eigene Nutzerklasse.** Sie behalten eine Hochschulgruppe, stehen in deren Mitgliederliste und sind dort lediglich gekennzeichnet. Das ist eine Markierung auf einem normalen Mitglied — und die Markierung existiert im Code bereits doppelt, als `MemberStatus` _und_ als `Role`. Das ist PR A: eine Dublette löschen, kein Feature bauen.

2. **BDAJ-Funktionär\*innen, Partnerorganisationen und Interessierte teilen eine Eigenschaft:** ein Account, dessen Zuhause keine Hochschulgruppe ist, der vom Bundesvorstand freigegeben wird und dessen Schreibrechte einzeln zugeschaltet werden. Die genehmigte BDAJ-Spec (`2026-09-07-bdaj-funktionaere-design.md`) löst das bereits — aber als Einzelfall. PR B verallgemeinert den Mechanismus, solange BDAJ noch nicht implementiert ist; danach kostet es eine Migration plus einen zweiten Enforcement-Pfad.

Die beiden PRs hängen **nicht** voneinander ab und können in beliebiger Reihenfolge gemergt werden. Empfohlene Reihenfolge ist A vor B, weil A reine Aufräumarbeit mit negativem Zeilensaldo ist und B den größeren Review braucht.

### Verworfene Alternativen

- **Discriminator auf `members` statt `groups.kind`** (Alumni/Interessierte mit `primary_group_id = NULL` plus `members.affiliation`): konzeptionell ehrlicher, aber genau die Alternative, die die BDAJ-Spec schon verworfen hat. Der Grund wiegt jetzt schwerer, nicht leichter: jede Modulgrenze (Events, Blog, Dateien, Verzeichnis) bräuchte einen eigenen Sonderfall „ungescoped, aber kein Bundesvorstand" — vier statt einem.
- **Drei getrennte Features** (BDAJ wie gespect, danach Alumni, danach Interessierte): einzeln reviewbar und einzeln streichbar, verdreifacht aber Freigabe-, Grant-, Verzeichnis- und Enforcement-Logik.
- **`netzwerk` schon jetzt in den CHECK-Constraint aufnehmen:** verstößt gegen CLAUDE.md §6 (keine spekulativen Abstraktionen). Die Achse selbst ist durch zwei bestätigte Anwendungen gedeckt, ein Enum-Wert ohne Zeilen und ohne Code nicht. Er kostet eine Migrationszeile, wenn seine Spec kommt.

---

## 2. PR A — Alumnus wird Rolle, `inactive` entfällt

### 2.1 Ausgangslage im Code

`alumnus` existiert heute zweimal:

- als `MemberStatus` (`modules/members/src/types.ts:3`), aus dem `effectiveGrants` einen ungescopten Grant ableitet (`roles.ts`),
- als `Role` im `Role`-Union (`modules/auth/src/sso.ts`) und in jedem `member_role_grants_role_check`-Constraint. Vergebbar ist die Rolle bereits: `requireCanGrant` fällt für `alumnus` in den „everything else → federal_board only"-Zweig.

`inactive` existiert faktisch **nicht mehr**. Die einzigen Fundstellen außerhalb von Tests sind die `TRANSITIONS`-Map und der Typ selbst; kein Code-Pfad schreibt den Wert. Migration `0008_application_reasons.sql` (ADR 0031) hat den Status aktiv geleert: abgelehnte Bewerber\*innen wurden nach `pending` zurückgesetzt und ihre Ablehnung in `member_group_change_requests` protokolliert.

`members.status` hat **keinen** CHECK-Constraint — die vier Werte leben ausschließlich in TypeScript (`0001_init.sql:10` ist ein reines `text NOT NULL DEFAULT 'pending'`).

### 2.2 Zielmodell

```
MemberStatus  = pending | active            wartet auf Aufnahme | aufgenommen
Alumnus       = Grant in member_role_grants, optional gescoped
Ablehnung     = member_group_change_requests.status = 'rejected'   (unverändert)
Austritt      = primary_group_id = NULL, status bleibt active      (unverändert)
```

Damit gilt die Regel der Föderation wörtlich: **wer schon einmal dabei war, ist Alumnus; wer abgelehnt wurde, war nie dabei.** Die beiden Fälle sind im Datenmodell bereits getrennt — ein\*e abgelehnte\*r Bewerber\*in bleibt `pending` und wird nie Alumnus. Das ist wichtig, weil Alumnus vollen Mitglieder-Zugriff behält (siehe 2.4).

### 2.3 Wer vergibt die Rolle

`alumnus` bleibt **optional gescoped** und wird damit von `canGrantLocalRoles` bereits korrekt geregelt — ohne neues Prädikat:

| Fall                                                                                                                                                    | `groupId`  | Wer darf vergeben                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Auswahl direkt bei der Registrierung, ohne Gruppe                                                                                                       | `null`     | Bundesvorstand (ein Lead scheitert an `canManageGroup`, weil `groupId === null` nur für `federal_board` passierbar ist) |
| Mitglied einer Hochschulgruppe wird Alumnus — Studienende, Austritt, oder eine\*r Ehemalige\*r, die\*der sich fälschlich einer Gruppe angeschlossen hat | Gruppen-ID | Lead dieser Gruppe, oder Bundesvorstand                                                                                 |

Die gesamte Codeänderung dafür ist, `role === "alumnus"` in die bestehende Bedingung in `requireCanGrant` (`modules/members/src/services/roles.ts`) aufzunehmen. `requireValidScope` bleibt unangetastet: `alumnus` steht heute in keiner der beiden Listen, ist also bereits optional gescoped.

Der Scope ist eine Herkunftsangabe, kein Recht: „Alumnus, ausgewiesen durch HG Aachen" bleibt historisch korrekt, auch wenn die Person später die Gruppe wechselt.

### 2.4 Was die Rolle bewirkt

**Nichts, außer der Kennzeichnung.** Alumni behalten `status = 'active'`, damit den `member`-Grant und damit den vollen Mitglieder-Zugriff inklusive Event-Anmeldung. In der Mitgliederliste ihrer Gruppe erscheinen sie mit der Markierung „Alumnus".

Das beantwortet eine offene Frage aus Spec §25 („Should alumni retain access to event registration, or only to read-only views?") mit **ja** und weicht bewusst von der Rollen-Tabelle in Spec §4 ab („Read-only access to network, opt-in newsletter, no event registration unless re-flagged") sowie von der Alumni-Zeile in §8 („retains read-only network access"). Der Newsletter-Opt-in bleibt davon unberührt. Deshalb ADR 0043.

### 2.5 Betroffene Stellen

| Datei                                                    | Änderung                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/members/src/types.ts`                           | `MemberStatus` auf `pending \| active`; Label-Map entsprechend                                                                                                                                                |
| `modules/members/src/roles.ts`                           | status-impliziter `alumnus`-Zweig aus `effectiveGrants` raus; `TRANSITIONS` schrumpft auf `pending → active`                                                                                                  |
| `modules/members/src/services/roles.ts`                  | `alumnus` in die Lead-vergebbare Bedingung in `requireCanGrant`                                                                                                                                               |
| `modules/members/src/services/pool.ts`                   | **Regression-Gefahr:** der Transfer-Pool schließt Alumni heute über den Status aus. Werden sie `active`, rutschen sie ungewollt zurück in den Pool. Der Ausschluss muss über den Grant neu formuliert werden. |
| `modules/members/src/services/stats.ts`                  | `StatusCounts` verliert `inactive` und `alumnus`; der Alumni-Eimer wird aus den Grants abgeleitet statt aus dem Status, sonst ändert sich die Zahl, die der Bundesvorstand sieht, stillschweigend             |
| `apps/web/app/_blog/access.ts:54`                        | `canComment` verkürzt sich auf `status === "active"`                                                                                                                                                          |
| `apps/web/app/(board)/_components/MembersTable.tsx`      | Markierung aus dem Grant statt aus dem Status                                                                                                                                                                 |
| `apps/web/app/account/view-model.ts`, `account/page.tsx` | dito                                                                                                                                                                                                          |
| `apps/web/content/faq/mitglieder.ts`                     | Text zum Alumni-Status anpassen                                                                                                                                                                               |
| `modules/members/migrations/00NN_alumnus_is_a_role.sql`  | siehe 2.6                                                                                                                                                                                                     |

### 2.6 Migration

```sql
-- 1. Verbliebene Alumni und Inaktive nach active, mit Grant-Zeile.
INSERT INTO member_role_grants (id, member_id, role, group_id, granted_at, granted_by)
SELECT 'mrg_alum_' || m.id, m.id, 'alumnus', m.primary_group_id, now(), 'system'
  FROM members m
 WHERE m.status IN ('alumnus', 'inactive')
   AND NOT EXISTS (
     SELECT 1 FROM member_role_grants g
      WHERE g.member_id = m.id AND g.role = 'alumnus' AND g.revoked_at IS NULL
   );

UPDATE members
   SET status = 'active', updated_at = now()
 WHERE status IN ('alumnus', 'inactive');

-- 2. Erstmals einen CHECK-Constraint setzen (bisher nur in TypeScript validiert).
ALTER TABLE members
  ADD CONSTRAINT members_status_check
  CHECK (status IN ('pending', 'active'));
```

Zu Schritt 1: `0008_application_reasons.sql` hat nur `inactive`-Zeilen mit `joined_at IS NULL` befreit, also die Nie-Mitglieder. Verbliebene `inactive`-Zeilen sind daher per Definition ehemalige Mitglieder mit gestempeltem `joined_at` — für die ist Alumnus die richtige Einordnung. Der `NOT EXISTS`-Guard macht die Migration idempotent.

### 2.7 Bewusst nicht enthalten

- **Kein Ausschluss-Mechanismus.** Mit `inactive` entfällt der letzte (ohnehin unverdrahtete) Weg, jemandem den Zugang zu entziehen, ohne den Account zu löschen. Faktisch ändert sich damit nichts am heutigen Verhalten. Falls die Föderation je einen Ausschluss bei Fehlverhalten braucht, ist das ein eigenes Feature mit eigener Spec — kein Nebenprodukt dieses PRs.
- **Kein Unique-Constraint gegen doppelte Alumnus-Grants.** Der bestehende Index ist `(member_id, role, COALESCE(group_id, ''))`, eine Person kann also einen gescopten _und_ einen ungescopten Alumnus-Grant halten. Für die Kennzeichnung ist das egal — sie ist ein `.some()`. In einer Rollen-Verwaltungsansicht stünden zwei Zeilen; das rechtfertigt keinen Constraint.
- **Kein automatischer Auslöser.** Alumnus wird vergeben, nicht abgeleitet. Exmatrikulations- oder Ablauf-Logik ist nicht Teil dieses PRs.

### 2.8 Tests

- `roles.unit.test.ts`: `effectiveGrants` leitet keinen Alumnus mehr aus dem Status ab; `canTransition` kennt nur noch `pending → active`.
- `services/roles.ts`: Lead der Gruppe X darf `alumnus` scoped auf X vergeben; Lead der Gruppe Y darf es nicht; ungescopt darf nur der Bundesvorstand.
- `pool.test.ts`: ein Mitglied mit aktivem Alumnus-Grant erscheint **nicht** im Transfer-Pool. Das ist der Regressionstest zu 2.5.
- Integrationstest über echtes Postgres: Migration auf einem Datenbestand mit je einer `alumnus`- und einer `inactive`-Zeile; danach beide `active` mit genau einem Grant, zweiter Lauf ändert nichts.
- `_blog/access.test.ts`: Kommentarrecht für ein Mitglied mit Alumnus-Grant bleibt bestehen.

---

## 3. PR B — `groups.kind`

### 3.1 Datenmodell

Unverändert aus BDAJ-Spec §3.1:

```sql
ALTER TABLE groups
  ADD COLUMN kind text NOT NULL DEFAULT 'hochschulgruppe';

ALTER TABLE groups
  ADD CONSTRAINT groups_kind_check
  CHECK (kind IN ('hochschulgruppe', 'affiliate'));

ALTER TABLE groups ALTER COLUMN city DROP NOT NULL;
ALTER TABLE groups
  ADD CONSTRAINT groups_affiliate_city_check
  CHECK (kind = 'hochschulgruppe' OR city IS NULL);
```

Keine neue Spalte auf `members`. „Welche Art Account ist das" wird immer aus `primary_group.kind` abgeleitet — eine Quelle der Wahrheit.

### 3.2 Das Flag

`getCurrentMember()` (`@bdas/members`) liefert zusätzlich `hasGroupScope: boolean`, abgeleitet aus `primary_group?.kind === 'hochschulgruppe'`. Das ist der einzige Ort, an dem die Frage beantwortet wird; Events, Dateien, Blog und Verzeichnis fragen nur dieses Flag ab.

Der Name weicht bewusst von `isAffiliate` in der BDAJ-Spec ab: Unter dieser Achse ist das Flag nicht mehr BDAJ-spezifisch, und ein Name mit „affiliate" wird in dem Moment falsch, in dem die zweite Art existiert. Die BDAJ-Spec ist entsprechend anzupassen, wenn sie implementiert wird — sie ist bislang reines Papier, also kostet das nichts.

Ein Mitglied ohne `primary_group_id` hat `hasGroupScope = false`. Das ist korrekt und ändert das heutige Verhalten nicht: `canManageGroup` gibt für `groupId === null` bereits nur dem Bundesvorstand recht.

### 3.3 Kein lokales Board auf Nicht-Hochschulgruppen

`grantRole()` wirft, wenn `role === 'local_board_lead'` und die Zielgruppe `kind <> 'hochschulgruppe'` ist. Das ist die tragende Regel der Achse: eine Gruppe ohne lokales Board eskaliert ihre Beitritts­entscheidungen laut ADR 0021 automatisch an den Bundesvorstand. Für Nicht-Hochschulgruppen wird das erzwungen, nicht gehofft — sonst unterläuft ein versehentlich vergebener Lead die Freigabe durch den Bundesvorstand.

### 3.4 Was PR B _nicht_ enthält

PR B legt **keine** Gruppenzeile an und schaltet **keine** UI frei. Er liefert die Achse, das Flag und die Board-Sperre. Jeder konkrete Nutzertyp ist danach eine eigene Spec und ein eigener PR:

- **BDAJ** — die genehmigte Spec vom 2026-09-07, angepasst auf `hasGroupScope` statt `isAffiliate`. Bringt die `bdaj`-Seed-Zeile, `member_folder_access`, den `blog_author`-Grant und die „nur eigene Inhalte"-Durchsetzung mit.
- **Weitere Partnerorganisationen** — je eine `affiliate`-Zeile plus Label, sobald BDAJ steht.
- **Interessierte ohne Hochschulgruppe** — braucht einen neuen `kind`-Wert (`netzwerk`), der bewusst noch nicht existiert. Eigene Spec.

### 3.5 Tests

- `grantRole` verweigert `local_board_lead` auf einer `affiliate`-Gruppe und lässt ihn auf einer `hochschulgruppe` zu.
- `city` darf auf einer `affiliate`-Zeile `NULL` sein und muss auf einer `hochschulgruppe` gesetzt bleiben.
- `hasGroupScope` ist `true` für ein Mitglied einer Hochschulgruppe, `false` für eines einer `affiliate`-Gruppe und `false` ohne Gruppe.
- Migration ist idempotent und setzt bestehende Zeilen auf `hochschulgruppe`.

---

## 4. Offen, bewusst nicht entschieden

- **Zählt ein Account ohne Hochschulgruppe als „aktives Mitglied"** in der gruppenübergreifenden Statistik (Spec §4)? Betrifft nur PR B und die späteren Typ-Specs; für Alumni ist die Frage in 2.5 beantwortet (eigener Eimer, aus Grants abgeleitet).
- **Darf ein Lead die Alumnus-Rolle auch wieder entziehen?** `revokeRole` läuft durch dasselbe `requireCanGrant`, also lautet die Antwort mit dieser Spec: ja, im eigenen Scope. Sollte beim Review bestätigt werden.
- **Bundesvorstand-Ordner auf Gruppenseiten** (offen seit 2026-09-09) bleibt unberührt.

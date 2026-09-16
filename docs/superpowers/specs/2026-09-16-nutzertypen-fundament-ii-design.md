# Nutzertypen-Fundament II: Mitgliedschaft, Nicht-Mitglieder und ihre Rechte — Design

**Date:** 2026-09-16
**Status:** Approved (brainstorming)
**Baut auf:** `docs/superpowers/specs/2026-09-12-nutzertypen-fundament-design.md` (PR A/B, beide gemergt), ADR 0043 (Alumnus ist eine Rolle), ADR 0021 (Beitritt entscheidet der lokale Vorstand), ADR 0031 (Bewerbung ist ein Gruppenantrag)
**Scope:** Die zweite Hälfte des Fundaments. Wer ist Mitglied, wer nicht, und was darf ein Account, der keines ist. Führt die Gruppenart `netzwerk` ein, macht Accounts ohne Hochschulgruppe standardmäßig rechtlos, gibt dem Bundesvorstand pro Person einzelne Ordner frei und schließt eine Autorisierungslücke bei der Event-Anmeldung. Betrifft `members`, `groups`, `files`, `events`, `blog` und `apps/web`.

---

## 1. Ausgangslage

PR A und PR B haben die Achsen gelegt: `alumnus` ist eine Rolle, jede Gruppe hat eine Art
(`hochschulgruppe | affiliate`), und `CurrentMember.hasGroupScope` beantwortet, ob der Account in
einer Hochschulgruppe sitzt. Was fehlt, ist alles, was daraus folgt. Acht Lücken, gefunden am
2026-09-15/16:

1. **Niemand kann ohne Gruppe aufgenommen werden.** `transitionStatus` kann es, keine Seite ruft es
   auf. Das blockiert Alumni vollständig.
2. **Es lässt sich keine Nicht-Hochschulgruppe anlegen.** Die Spalte existiert, aber
   `createGroup`/`upsertGroupBySlug` erzeugen ausschließlich `hochschulgruppe`, und `city` ist im
   Eingabeschema Pflicht.
3. **Nichts beschränkt einen Account ohne Hochschulgruppe.** `hasGroupScope` liest niemand. Die
   Zugriffsprüfungen fragen `status === "active"` — wer aufgenommen ist, bekommt die
   föderationsweiten Mitgliederdateien, die Mitglieder-Events und das Kommentarrecht im Blog.
4. **Es gibt keinen Ordnerzugriff pro Person.** `files` kennt fünf feste Scopes, mehr nicht. Die
   genehmigte BDAJ-Spec braucht „diese Person darf in diese Ordner".
5. **Die Ordner-Bereitstellung greift daneben.** Jede neue Gruppe bekommt einen Mitglieder- und
   einen Vorstandsordner — auch eine Gruppe, die nie einen Vorstand haben kann.
6. **Interessierte gibt es nicht.** Keine Gruppenart, kein Aufnahmeweg, keine Rechte-Definition.
7. **Die Alumnus-Markierung ist an den Kontostatus nicht gebunden.** `grantRole` markiert auch
   `pending`-Personen; die verschwinden dann aus „Ohne Gruppe", ohne je aufgenommen zu sein.
8. **Die Event-Anmeldung prüft die Sichtbarkeit nicht.** `registerAction` prüft nur, dass ein
   Profil existiert; `registerMember` nur, dass die Veranstaltung veröffentlicht und nicht
   gestartet ist. Wer die Event-ID kennt, meldet sich zu einer `members_only`- oder fremden
   `group_only`-Veranstaltung an, auch als `pending`. Das ist eine Autorisierungslücke, unabhängig
   von allen Nutzertypen.

## 2. Entscheidungen der Föderation (2026-09-15/16)

- **Alumni ohne Gruppe nimmt der Bundesvorstand auf.** Kein Nachweis.
- **Zwei getrennte Schritte, nur für Alumni:** Plattformzugang (Bundesvorstand), danach optional
  Gruppenzugang (Lead der Zielgruppe, bestehender Antragsweg).
- **Interessierte sind Förderer und Netzwerk-Kontakte** — Spender\*innen, Referent\*innen,
  Einzelpersonen bei Partnerorganisationen. Kein Anspruch auf Mitgliedschaft.
- **Sie dürfen ihre eigenen Dinge und intern-bundesweite Veranstaltungen** (`members_only`), also
  alles, wofür eine Anmeldung nötig ist, aber keine Gruppenzugehörigkeit. Keine Dateien, kein
  Kommentarrecht, keine Gruppen-Events.
- ~~**Registrieren genügt**, niemand entscheidet über sie.~~ **Geändert 2026-09-16 (ADR 0046):**
  Förderer nimmt der Bundesvorstand auf.
- **Die Alumnus-Markierung ist der Mitgliedsnachweis** für Ehemalige ohne Gruppe.
- **Neue interne Funktionen sperren Nicht-Mitglieder standardmäßig aus.**
- **Interessierte wohnen in einer gemeinsamen `netzwerk`-Gruppe.**
- **Dateien: nichts, außer der Bundesvorstand gibt einzelne Ordner frei.**

## 3. Das Modell

Drei unabhängige Achsen, jede mit genau einer Quelle der Wahrheit:

| Achse          | Werte                                                                        | Wo sie lebt                           |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| Kontostatus    | `pending` \| `active`                                                        | `members.status`                      |
| Zuhause        | Gruppenart `hochschulgruppe` \| `affiliate` \| `netzwerk`, oder keine Gruppe | `groups.kind` über `primary_group_id` |
| Mitgliedschaft | ja / nein                                                                    | abgeleitet, siehe 3.1                 |

### 3.1 Mitgliedschaft

```
isBdasMember = status === "active"
               && (primaryGroup.kind === "hochschulgruppe" || hält aktiven alumnus-Grant)
```

Das ist die **einzige** Stelle, an der „ist diese Person BDAS-Mitglied" beantwortet wird. Sie lebt
neben `hasGroupScope` in `modules/members/src/services/me.ts` und kommt als
`CurrentMember.isBdasMember` an jede Oberfläche.

Warum die Markierung als Nachweis zählt: ein\*e Ehemalige\*r ohne Gruppe ist Mitglied, ein Förderer
ohne Gruppe nicht. Beide haben keine Hochschulgruppe; die Markierung ist der einzige bereits
vorhandene Unterschied (ADR 0043). Es entsteht kein zweites Feld.

`hasGroupScope` bleibt, was es ist — „sitzt in einer Hochschulgruppe" — und ist der Baustein, aus
dem `isBdasMember` besteht. Findet sich nach dem Registrierungs-Wizard kein eigener Konsument
dafür, wird es dort gestrichen; in dieser Spec wird es nicht entfernt.

### 3.2 Die vier Nutzertypen

| Typ                             | Gruppe                     | Mitglied                 | Aufnahme durch                       |
| ------------------------------- | -------------------------- | ------------------------ | ------------------------------------ |
| Mitglied                        | Hochschulgruppe            | ja                       | Lead der Gruppe (ADR 0021/0031)      |
| Alumnus                         | Hochschulgruppe oder keine | ja (über die Markierung) | Lead; ohne Gruppe der Bundesvorstand |
| BDAJ / Partnerorganisation      | `affiliate`                | nein                     | Bundesvorstand (erzwungen, PR B)     |
| Interessierte\*r / Förderer\*in | `netzwerk`                 | nein                     | Bundesvorstand (ADR 0046)            |

### 3.3 Der `member`-Grant wird ehrlich

`effectiveGrants` leitet den ungescopten `member`-Grant heute aus `status === "active"` ab. Ab
dieser Spec leitet er ihn aus `isBdasMember` ab. Damit ist der Grant das, wonach er klingt, und
jede künftige Funktion, die ihn prüft, sperrt Nicht-Mitglieder ohne weiteres Zutun aus
(Entscheidung „standardmäßig ausgesperrt").

## 4. Zugriffsmatrix

| Oberfläche                                         | Prüft heute              | Prüft künftig                     | Interessierte | BDAJ          |
| -------------------------------------------------- | ------------------------ | --------------------------------- | ------------- | ------------- |
| Föderationsweiter Mitgliederordner (`members_all`) | Status aktiv             | `isBdasMember`                    | nein          | nein¹         |
| Gruppenordner (`group_members`)                    | Status + Gruppe          | unverändert                       | nein          | nein¹         |
| Ordner pro Person                                  | —                        | neue Freigabe (5.3)               | nein²         | ja, einzeln   |
| Event `public`                                     | alle                     | unverändert                       | ja            | ja            |
| Event `members_only`                               | Status aktiv             | Status aktiv                      | **ja**        | ja            |
| Event `group_only`                                 | Gruppenzugehörigkeit     | unverändert                       | nein          | nein          |
| Event-Anmeldung                                    | nur Profil vorhanden     | Status aktiv **und** Sichtbarkeit | entsprechend  | entsprechend  |
| Blog kommentieren                                  | Status aktiv             | `isBdasMember`                    | nein          | nein          |
| Blog schreiben                                     | Grant-basiert            | unverändert                       | nur mit Grant | nur mit Grant |
| Dashboard/Cockpit                                  | Lead oder Bundesvorstand | unverändert                       | nein          | nein          |
| Öffentliche Gruppenliste und Karte                 | alle aktiven Gruppen     | nur `hochschulgruppe`             | —             | —             |
| Mitgliederstatistik                                | alle `members`-Zeilen    | nur Mitglieder (3.1)              | nicht gezählt | nicht gezählt |

¹ Solange der Bundesvorstand den Ordner nicht einzeln freigibt.
² Technisch möglich, praktisch nie vorgesehen.

**Warum `members_only` am Status hängen bleibt:** das ist die Zusage an die Förderer — „intern,
aber bundesweit". Die Bedingung heißt dort bewusst „aufgenommener Account", nicht „Mitglied".
Gruppen-Events bleiben über die Gruppenzugehörigkeit ausgeschlossen, ohne Sonderfall.

## 5. Änderungen je Modul

### 5.1 `modules/groups`

- Migration `0008_group_kind_netzwerk.sql`: `groups_kind_check` um `netzwerk` erweitern
  (drop + recreate). Der bestehende `groups_kind_city_check` trägt den neuen Wert unverändert
  mit — nur `hochschulgruppe` hat eine Stadt.
- `GroupKind` wird `hochschulgruppe | affiliate | netzwerk`.
- `UpsertGroupInput` bekommt ein optionales `kind` (Vorgabe `hochschulgruppe`), und `city` wird
  darin abhängig von der Art: Pflicht bei `hochschulgruppe`, verboten sonst (zod
  `superRefine`, dieselbe Regel wie der DB-Constraint). Damit ist der Seed der Weg, eine
  `affiliate`- oder `netzwerk`-Zeile anzulegen. `CreateGroupInput`/`UpdateGroupInput` — das
  Vorstandsformular — bleiben unverändert auf `hochschulgruppe` und Stadt-Pflicht.
- `listGroups` bekommt `kind?: GroupKind` als Filter, und `listGroupIdsByKind(db, kind)` kommt als
  schmaler Leser dazu — `members` braucht ihn für die Statistik und darf die `groups`-Tabelle
  nicht selbst abfragen (CLAUDE.md §1 Regel 1).
- Seed `infra/seeds/groups.json`: ein Eintrag `netzwerk` (`slug: "netzwerk"`, `name: "BDAS
Netzwerk"`, `kind: "netzwerk"`, ohne `city`).

### 5.2 `modules/members`

- `getCurrentMember` liest die Art der primären Gruppe ohnehin schon. Sie wird als
  `CurrentMember.primaryGroupKind: GroupKind | null` durchgereicht, daraus entstehen ohne weitere
  Abfrage `hasGroupScope` (`=== "hochschulgruppe"`) und das neue `isBdasMember` nach 3.1. Die
  Ableitung selbst ist eine reine Funktion `isBdasMemberFrom(member, kind, grants)`, damit sie ohne
  Sitzung testbar bleibt.
- `effectiveGrants` vergibt `member` nur noch für Mitglieder. Die Funktion ist rein und kennt die
  Gruppenart nicht, bekommt sie also als zusätzliches Argument (`isMember: boolean`) von
  `getCurrentMember`.
- **Aufnahme ohne Gruppe:** neuer Service `acceptAsAlumnus(db, memberId, actor)` — nur
  Bundesvorstand, nur für Mitglieder ohne Gruppe (bei einer Gruppe entscheidet deren Vorstand,
  ADR 0021). Er verdrahtet zwei vorhandene Schritte: `transitionStatus(… "active")`, danach
  `grantRole(… "alumnus", null)`. Bewusst **keine** gemeinsame Transaktion: beide Services öffnen
  ihre eigene und sind idempotent, ein Abbruch zwischen ihnen hinterlässt ein aufgenommenes
  Mitglied ohne Markierung, und ein zweiter Klick vervollständigt es.
- **Beitritt zur `netzwerk`-Gruppe:** ~~selbstbedient~~ — **geändert durch ADR 0046.** Der
  Beitritt ist ein gewöhnlicher Antrag; die Gruppe hat keinen Vorstand, also entscheidet der
  Bundesvorstand (Rückfall aus ADR 0021), und die Annahme setzt den Account auf `active`. Ein
  Mitglied **ohne** Alumnus-Markierung ist nach dem genehmigten Wechsel kein Mitglied mehr (3.1);
  ein\*e Ehemalige\*r **mit** Markierung bleibt es (ADR 0043).
- **Alumnus nur für Aufgenommene:** `grantRole` wirft `ValidationError`, wenn `role === "alumnus"`
  und das Zielmitglied nicht `active` ist. `acceptAsAlumnus` setzt deshalb zuerst den Status.
- `countMembersByStatus` zählt nur Mitglieder nach 3.1: die Hochschulgruppen-IDs kommen über
  `listGroupIdsByKind` aus `@bdas/groups` (kein Zugriff auf deren Tabelle), dazu alle Zeilen mit
  aktivem `alumnus`-Grant. Der `alumnus`-Eimer bleibt unverändert.

### 5.3 `modules/files`

- Migration `0005_folder_member_grants.sql`: Tabelle `folder_member_grants`
  (`id`, `folder_id` FK `folders` ON DELETE CASCADE, `member_id`, `can_write boolean NOT NULL
DEFAULT false`, `granted_at`, `granted_by`, `revoked_at`), Teilindex auf
  `(folder_id, member_id) WHERE revoked_at IS NULL`. Reihenrichtlinien (RLS) wie in
  `0002_rls_lockdown.sql`.
- `canRead`/`canWrite` bleiben reine Funktionen und behalten ihre Signatur bis auf einen
  **optionalen dritten Parameter** `access: ReadonlyMap<string, boolean>` (Ordner-ID → darf
  schreiben), Vorgabe leer. `canRead` gibt `true` zurück, wenn die Scope-Regel **oder** eine
  Freigabe greift; `canWrite` entsprechend mit `can_write`. Die Dateidienste laden die Freigaben
  des Aufrufers einmal und reichen sie durch; die App-Schicht und ihre acht Aufrufstellen bleiben
  unverändert. Ein `FileViewer`-Typ, der `CurrentMember` ersetzt, wäre dieselbe Wirkung mit
  deutlich mehr Umbau.
- `members_all` prüft `isBdasMember` statt `status === "active"`.
- Services `grantFolderAccess` / `revokeFolderAccess` / `listFolderAccess`, nur Bundesvorstand.
  Keine Oberfläche in dieser Spec — der Bundesvorstand bekommt sie mit dem BDAJ-PR; bis dahin ist
  die Tabelle leer und ändert nichts.
- `provisionGroupFolders` legt Ordner nur noch für `hochschulgruppe` an. Für jede andere Art
  entsteht kein Ordner: ein Vorstandsordner ohne möglichen Vorstand wäre falsch, und ein
  Mitgliederordner für Nicht-Mitglieder ebenso. Die Art kommt über `getGroupKind` aus
  `@bdas/groups` (bereits eine Abhängigkeit).

### 5.4 `modules/events` und die Anmeldeaktion

- `registerAction` (app-Schicht) prüft vor `registerMember`: Account ist `active`, und
  `canView(viewerFrom(me), event)` ist wahr. Der Service bleibt auth-agnostisch (Konvention des
  Moduls), die Autorisierung liegt in der Aktion — wie bei den Events-Schreibpfaden nach dem
  Befund zu `updateEventAction`.
- `viewerFrom` bleibt unverändert: `isActiveMember` ist weiterhin statusbasiert, damit Förderer
  die bundesweiten internen Veranstaltungen sehen und sich anmelden können.
- Gastanmeldung bleibt unberührt (nur `public` + Opt-in).

### 5.5 `modules/blog` / `apps/web/app/_blog`

- `canComment` prüft `isBdasMember` statt `status === "active"`. Alumni bleiben eingeschlossen
  (sie sind Mitglieder), Förderer und BDAJ nicht.

### 5.6 `apps/web`

- „Ohne Gruppe" bekommt die Aktion **„Als Alumnus aufnehmen"** pro Zeile (Bundesvorstand). Sie
  ruft `acceptAsAlumnus`, zeigt Erfolg oder Server-Ablehnung an und lässt die Zeile aus der Liste
  verschwinden — der Pool schließt Alumni bereits aus.
- Öffentliche Gruppenliste (`/gruppen`) und Karte filtern auf `kind === "hochschulgruppe"`.
- `/account` zeigt für einen Account der Art `netzwerk` die Zeile „Status: Förderer" statt
  „Aktives Mitglied"; die Gruppenzeile entfällt. Keine weitere Gestaltung — die Seite bleibt im
  einfachen Layout.
- Kein Einstiegspunkt für die Förderer-Registrierung. Der kommt mit dem Triage-Wizard; bis dahin
  entsteht ein solcher Account nur über den Seed plus den Beitrittsservice.

## 6. Migrationen

| Modul    | Datei                           | Inhalt                            |
| -------- | ------------------------------- | --------------------------------- |
| `groups` | `0008_group_kind_netzwerk.sql`  | `netzwerk` in `groups_kind_check` |
| `files`  | `0005_folder_member_grants.sql` | Tabelle + Index + RLS             |

`members` braucht keine Migration: Mitgliedschaft wird abgeleitet, nicht gespeichert.

## 7. Tests

- `members`: `isBdasMember` für Hochschulgruppe / Alumnus ohne Gruppe / `netzwerk` / `affiliate` /
  `pending`; `member`-Grant fehlt bei Nicht-Mitgliedern; `acceptAsAlumnus` nur Bundesvorstand,
  setzt Status und Grant, ist idempotent; `grantRole` verweigert `alumnus` für `pending`;
  über einen Antrag an die `netzwerk`-Gruppe entscheidet nur der Bundesvorstand (ADR 0046);
  `countMembersByStatus` zählt Förderer nicht mit.
- `groups`: `netzwerk` erlaubt, Stadt verboten; Upsert mit `kind`; `listGroups`-Filter.
- `files`: `members_all` für Förderer gesperrt, für Alumni offen; Freigabe pro Person öffnet genau
  einen Ordner, lesend bzw. schreibend; Widerruf schließt ihn; `provisionGroupFolders` legt für
  `netzwerk`/`affiliate` nichts an.
- `events`/`apps/web`: `registerAction` weist `pending`, `members_only` für Anonyme und fremde
  `group_only` ab; Förderer darf `members_only`; Gastanmeldung unverändert.
- `_blog/access`: Kommentarrecht für Alumni ja, für Förderer nein.
- Alle Integrationstests gegen Docker-Postgres, keine Datenbank-Mocks (CLAUDE.md §4).

## 8. Bewusst nicht enthalten

- **Der Triage-Wizard** und jeder öffentliche Einstiegspunkt für Förderer oder Alumni.
- **Die BDAJ-Umsetzung**: Seed-Zeile, Freigabe-Oberfläche für Ordner, `blog_author`-Grants, die
  „nur eigene Inhalte"-Durchsetzung. Diese Spec liefert nur die Mechanik darunter. Die BDAJ-Spec
  ist außerdem an einer Stelle zu korrigieren, wenn sie umgesetzt wird: sie setzt
  `primary_group_id` schon bei der Registrierung, was ADR 0031 verbietet — der Beitritt ist ein
  Antrag an die BDAJ-Gruppe, über den der Bundesvorstand entscheidet.
- **Ein Mitgliederverzeichnis.** Es existiert nicht; „Lesezugriff aufs Netzwerk" aus Spec §4 ist
  damit gegenstandslos.
- **Eine Fähigkeiten-Tabelle** (`capabilities`) als eigene Schicht — verworfen als spekulative
  Abstraktion für vier Aufrufstellen (CLAUDE.md §6).
- **Förderer-Kategorien** (Spender, Referent, Partner) — eine Gruppe, keine Unterteilung.
- **Ein Ausschluss-Mechanismus.** Unverändert offen seit ADR 0043.

## 9. ADR

Diese Spec ändert zwei bereits entschiedene Dinge und braucht dafür einen ADR (nächste freie
Nummer **0045**, da 0044 vergeben ist):

- Der `member`-Grant folgt der Mitgliedschaft, nicht dem Kontostatus.
- ~~Der Beitritt zu einer `netzwerk`-Gruppe ist selbstbedient~~ (überschrieben durch ADR 0046) und damit die erste Ausnahme von
  „über einen Gruppenbeitritt entscheidet ein Vorstand" (ADR 0021/0031).

## 10. PR-Zuschnitt

| PR  | Inhalt                                                                                                          | Abhängig von |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | `groups`: `netzwerk`, Upsert mit Art, `listGroups`-Filter, Seed-Zeile, öffentliche Listen filtern               | —            |
| 2   | `members`: `isBdasMember`, `member`-Grant, `acceptAsAlumnus`, Alumnus-Guard, Netzwerk-Beitritt, Statistik       | 1            |
| 3   | Rechte-Schicht: `files` `members_all`, Blog-Kommentare, Event-Anmeldung (Sicherheitsfix), Ordner-Bereitstellung | 2            |
| 4   | `files`: Freigabe pro Person (Tabelle, Services, Betrachter)                                                    | 3            |
| 5   | `apps/web`: „Als Alumnus aufnehmen", `/account` für Förderer                                                    | 2            |

PR 3 enthält den Sicherheitsfix und sollte deshalb nicht hinter PR 4 warten. Jeder PR bekommt
`/review`; PR 2, 3 und 4 zusätzlich `/security-review` (Autorisierungsänderungen).

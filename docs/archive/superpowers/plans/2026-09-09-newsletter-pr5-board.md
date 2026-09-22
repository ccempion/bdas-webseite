# Newsletter PR 5 — Board-Ansicht

**Goal:** `/federal/newsletter` — Liste, Kennzahlen, Filter, CSV-Export,
Nav-Eintrag. Der letzte offene Punkt aus §12 des Spec-Schnitts.

**Architecture:** Fachlich ist alles da. `listSubscribers(db, filter)` und
`countSubscribers(db)` liefern seit PR 1 aufgelöste, entdoppelte Zeilen.
PR 5 ist eine Seite, eine Route und **eine** neue Funktion in `@bdas/auth`.

**Spec:** `docs/superpowers/specs/2026-09-06-newsletter-modul-design.md` §4
(Auflösung und Entdopplung), §8 (Zugriff), §12 Nr. 5. Vorgänger:
`2026-09-09-newsletter-pr4-flaechen.md`.

---

## Die Vorbedingung, die diesen PR blockiert

`listSubscribers` löst Kontoadressen über den `AccountEmailResolver` auf. Die
Verdrahtung in `apps/web/lib/newsletter-bootstrap.ts` steht seit PR 2 unter
einem Kommentar, der genau diesen Tag ankündigt:

> `@bdas/auth` exposes only a single-user reader today. PR 2 resolves exactly
> one id per request (the signed-in account), so this is one query. **BEFORE
> PR 5 ships the board list, auth needs a real batch read
> (`getUserEmails(db, ids)`)** — hundreds of rows through this loop would be a
> textbook N+1, which is the very thing the batch signature exists to prevent.

Nachgeprüft: Es gibt ihn nicht. Die Resolver-Signatur nimmt seit Tag 1 ein
Array — nur die Implementierung schleift heute in einer `Promise.all` über
`getUserExport`. Bei 500 Abonnenten sind das 500 Abfragen pro Seitenaufruf,
auf einem Pooler, der laut `project_transaction-pooler-hangs-under-concurrency`
schon einmal unter Nebenläufigkeit hing.

Deshalb ist **Task 1 der Stapelleser**, und nichts anderes.

## Entscheidungen, die dieser Plan über die Spec hinaus trifft

1. **Gefiltert wird im Browser, nicht über die URL.** `listSubscribers` lädt
   ohnehin jede Zeile und entdoppelt im Speicher — ein serverseitiger Filter
   spart keine Abfrage, kostet aber `searchParams`-Verdrahtung und einen
   Seitenaufbau pro Klick. Muster ist `MembersTable` auf `/federal/members`:
   Server lädt vollständig, ein Client-Baum filtert sofort. `SubscriberFilter`
   bleibt unangetastet und weiter für Aufrufer da, die serverseitig filtern
   wollen — der CSV-Export ist keiner (siehe 2).
2. **Der CSV-Export exportiert immer die ganze Liste**, nicht die gefilterte
   Ansicht. Eine CSV wird in einer Tabellenkalkulation geöffnet, die filtern
   kann; den Filterzustand durch eine Route zu reichen wäre Aufwand für eine
   Fähigkeit, die das Zielprogramm mitbringt. Steht so im Export-Knopf.
3. **Die Route ist ein Route-Handler, kein Server-Action-Download.** Muster ist
   `app/admin/events/[id]/roster.csv/route.ts`: `content-disposition:
attachment`, `text/csv; charset=utf-8`. Ein Download ist ein GET auf eine
   URL, keine Mutation.
4. **Die Route prüft selbst, sie erbt nicht.** `requireFederalScope()`
   _redirected_ nach `/account` — für eine Datei-URL wäre eine
   HTML-Weiterleitung die falsche Antwort. Der Handler antwortet wie
   `roster.csv`: `404` ohne Begründung, wenn jemand nicht darf.
5. **BOM vor der CSV.** Excel unter Windows liest UTF-8 ohne Byte Order Mark
   als Latin-1, und dann steht in der Adressspalte `mÃ¼ller@…`. Drei Bytes,
   die den Unterschied zwischen brauchbar und unbrauchbar machen. Wird als
   Testfall festgehalten, nicht nur als Kommentar.
6. **Keine Adressen in Logs, keine Adressen in der URL.** Die Ansicht zeigt
   personenbezogene Daten; der Filter lebt im Browser (siehe 1), also taucht
   keine gesuchte Adresse in einem Server-Log oder im Verlauf auf. Das ist ein
   Nebengewinn von Entscheidung 1 und der Grund, sie nicht später umzudrehen.
7. **Kein Export-Protokoll.** §8 hat das erwogen und bewusst weggelassen; das
   bleibt so. Hier nur vermerkt, damit es im Review nicht als Vergessen gilt.

8. **Die Tabelle zeigt die aktuelle Gruppe der Person, nicht das gespeicherte
   `group_id`.** Die beiden sind verschiedene Dinge. `group_id` ist laut §4 die
   _Herkunft_ einer Eintragung („aus wessen Umfeld kam sie") und Grundlage für
   die vertagte Kennzahl aus §14 — nachgeprüft: **keine Fläche schreibt es
   heute**, jede Zeile hat `null`. Was ein Vorstand beim Draufschauen braucht,
   ist die Gruppe, in der die Person Mitglied ist. Aufgelöst wie die Adresse,
   also im App-Layer über `listMembers` + `listGroups` (Muster
   `/federal/members`), damit `modules/newsletter` keine Abhängigkeit auf
   `modules/members` bekommt. Das Herkunftsfeld bleibt unangetastet: Es mit der
   Mitgliedschaft zu überschreiben würde die Kennzahl zerstören, bevor es sie
   gibt.
9. **`SubscriberRow.hasAccount: boolean` wird zu `userId: string | null`.** Ein
   Feld statt zweier, die dasselbe sagen — und die Naht, an der jede künftige
   Spalte hängt. Mit der Id in der Hand ist eine weitere Spalte (etwa der
   angekündigte „Usertype", sobald es mehr Nutzerarten gibt) ein Join im
   App-Layer: kein Eingriff ins Modul, keine Migration, keine neue
   Modul-Signatur. Der Typ hat heute keinen Verwender außerhalb des Moduls, die
   Umstellung kostet also nichts.

## Global Constraints

- **Feature-Flag `newsletter`.** `/federal/newsletter` und die Export-Route
  gehören dem Modul, also `requireNewsletterFlag()` bzw. `404` — nicht das
  `newsletterEnabled() && null` der eingebetteten Flächen.
- **Zugriff nur `federal_board`** (§8). Seite über `requireFederalScope()`,
  Route über den eigenen Check aus Entscheidung 4.
- **Regel 1:** Nur `modules/newsletter` liest `newsletter_*`. Die Seite ruft
  ausschließlich `listSubscribers` und `countSubscribers`.
- **Regel 2:** Der Stapelleser gehört in `@bdas/auth` und wird über den
  vorhandenen `AccountEmailResolver` eingehängt — `modules/newsletter` bekommt
  keine Abhängigkeit auf `@bdas/auth`.
- Deutsch, Duzen, Tonalität F2. Kommentare und Bezeichner englisch.
- Design-Token statt Inline-Werten (CLAUDE.md §7).
- Tests im selben PR. Integrationstests gegen Docker-Postgres.
- **Vor dem E2E-Lauf `lsof -i :3000` prüfen** und die volle Suite laufen
  lassen — und dabei die verwaisten Worktrees ausschließen
  (`--exclude '**/worktrees/**'`), sonst scheitert bei jedem Lauf ein anderer
  fremder Test und die Ampel ist wertlos.

## Dateistruktur

| Datei                                                              | Verantwortung                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------- |
| `modules/auth/src/services/export.ts`                              | **neu** — `getUserEmails(db, ids)`                       |
| `modules/auth/src/services/export.test.ts`                         | Stapelleser, inkl. leerer Eingabe                        |
| `modules/auth/src/index.ts`                                        | Export                                                   |
| `apps/web/lib/newsletter-bootstrap.ts`                             | Resolver auf den Stapelleser umstellen                   |
| `apps/web/app/(board)/nav.ts`                                      | Nav-Eintrag                                              |
| `apps/web/app/(board)/nav.test.ts`                                 | Nav-Eintrag                                              |
| `modules/newsletter/src/types.ts`                                  | `hasAccount` → `userId`                                  |
| `modules/newsletter/src/services/read.ts`                          | dito                                                     |
| `apps/web/app/(board)/federal/newsletter/page.tsx`                 | **neu** — Server: laden, zählen, gaten, Gruppen auflösen |
| `apps/web/app/(board)/federal/newsletter/SubscriberTable.tsx`      | **neu** — Client: Filter, Suche, Tabelle                 |
| `apps/web/app/(board)/federal/newsletter/SubscriberTable.test.tsx` | **neu**                                                  |
| `apps/web/lib/subscribers-csv.ts`                                  | **neu** — reine Funktion, Zeilen → CSV                   |
| `apps/web/lib/subscribers-csv.test.ts`                             | **neu** — Trennzeichen, BOM, Anführung                   |
| `apps/web/app/(board)/federal/newsletter/export.csv/route.ts`      | **neu** — Download                                       |
| `e2e/newsletter-board.e2e.ts`                                      | **neu** — Abnahme                                        |

---

### Task 1: Der Stapelleser in `@bdas/auth`

**Files:** `modules/auth/src/services/export.ts`, dessen Test, `index.ts`,
`apps/web/lib/newsletter-bootstrap.ts`

**Produces:** `getUserEmails(db, ids: readonly string[]): Promise<Map<string, string>>`

- [x] **Schritt 1: Failing test** — drei Ids, davon eine unbekannte: Die Map
      enthält zwei Einträge, die unbekannte fehlt (nicht `undefined` als Wert).
      Leeres Array → leere Map **ohne** Abfrage, weil `inArray(x, [])` je nach
      Treiber `false` oder einen Syntaxfehler ergibt.
- [x] **Schritt 2:** Implementieren mit `inArray(authUsers.id, ids)`, eine
      Abfrage. `emailDisplay` wie `getUserExport`, nicht `emailNormalized` —
      angezeigt wird, was die Person selbst geschrieben hat.
- [x] **Schritt 3:** `index.ts` erweitern.
- [x] **Schritt 4:** `newsletter-bootstrap.ts` — die `Promise.all`-Schleife
      durch den einen Aufruf ersetzen und den veralteten Kommentar entfernen.
      Der Resolver ist damit das, was seine Signatur immer versprochen hat.
- [x] **Schritt 5:** `pnpm vitest run modules/auth apps/web/lib && pnpm typecheck && pnpm lint`
- [x] **Schritt 6: Commit** — `perf(auth): read account addresses in one query, not one each`

### Task 2: CSV als reine Funktion

**Files:** `apps/web/lib/subscribers-csv.ts` + Test

Zuerst, weil sie ohne Seite und ohne Route testbar ist — und weil die
Feinheiten hier sitzen, nicht in der Route.

- [x] **Schritt 1: Failing test** — Kopfzeile; ein Feld mit Komma,
      Anführungszeichen und Zeilenumbruch wird korrekt gequotet (`""` als
      Escape); Datumsangaben als ISO-8601; `null` wird zu leer, nicht zu
      `"null"`; das Ergebnis beginnt mit dem BOM (Entscheidung 5).
- [x] **Schritt 2:** Implementieren. Spalten: `email`, `status`, `source`,
      `source_path`, `group` (aufgelöster Name), `has_account`, `created_at`,
      `confirmed_at`. Nicht die roh gespeicherte `group_id` — die ist Herkunft,
      heute leer, und in einer Tabellenkalkulation wäre eine Spalte voller
      Fremdschlüssel wertlos. Nicht `id` und nicht `user_id`: interne
      Schlüssel, die außerhalb nichts bedeuten.
- [x] **Schritt 3: Commit** — `feat(newsletter): the subscriber list as a file a spreadsheet can read`

### Task 3: Die Seite

**Files:** `page.tsx`, `SubscriberTable.tsx` + Test, `nav.ts` + Test

- [x] **Schritt 1: Failing test** für `SubscriberTable` — die vier Statusfilter
      und die Suche wählen die erwarteten Zeilen; die Suche trifft
      Teilzeichenketten unabhängig von Groß- und Kleinschreibung; „Alle" zeigt
      alles. Muster: `MembersTable`, gerendert über `renderToStaticMarkup`,
      Interaktion über happy-dom wo nötig.
- [x] **Schritt 2:** `page.tsx` — `requireNewsletterFlag()`,
      `requireFederalScope()`, dann `listSubscribers(db, {})`,
      `countSubscribers(db)`, `listMembers(db, {})` und `listGroups(db)`
      parallel. Aus den letzten beiden eine Karte `userId → Gruppenname`, wie
      `/federal/members` es tut. Eine Zeile ohne Konto hat keine Gruppe und
      zeigt einen Gedankenstrich, nicht „unbekannt". Vier Kennzahlen als Kacheln:
      `subscribed`, `pending`, `unsubscribed`, `declined`. **Die Kacheln und
      die Tabelle stammen aus derselben Pipeline** (`loadDeduped`), können sich
      also nicht widersprechen — das ist der Grund, warum `countSubscribers`
      existiert und nicht vier `COUNT(*)`.
- [x] **Schritt 3:** `SubscriberTable.tsx` — Client, Filter im Speicher.
      Spalten: Adresse, Status, Quelle, Gruppe, Konto?, Eingetragen am. Statusfilter
      als `FilterChip` (vorhandenes Primitiv), Suche als `Input`.
      Export-Knopf als gewöhnlicher Link auf die Route.
- [x] **Schritt 4:** Nav-Eintrag `{ href: "/federal/newsletter", label: "Newsletter" }`
      hinter „FAQ", plus Zeile in `nav.test.ts`.
- [x] **Schritt 5: Commit** — `feat(newsletter): the board can see who is on the list`

### Task 4: Die Export-Route

**Files:** `export.csv/route.ts`

- [x] **Schritt 1:** Handler nach dem Muster von `roster.csv`: Flag, Sitzung,
      `canSeeFederalScope` — jede Verweigerung als `404`, nie als Redirect
      (Entscheidung 4).
- [x] **Schritt 2:** `listSubscribers(db, {})` → `subscribersToCsv` →
      `content-disposition: attachment; filename="newsletter-<datum>.csv"`.
- [x] **Schritt 3:** Typecheck, Lint.
- [x] **Schritt 4: Commit** — `feat(newsletter): the list as a download, for the board only`

### Task 5: E2E und Abnahme

- [x] **Schritt 1:** `e2e/newsletter-board.e2e.ts` — ein Bundesvorstand sieht
      eine eingetragene Adresse in der Liste und die Kennzahl stimmt; ein
      einfaches Mitglied bekommt auf `/federal/newsletter` **und** auf
      `/federal/newsletter/export.csv` eine 404; der Export liefert
      `text/csv` und enthält die Adresse. `resetNewsletterRateLimits()`
      voranstellen.
- [x] **Schritt 2: Volle Suite**, mit ausgeschlossenen Worktrees:
      `pnpm vitest run --exclude '**/worktrees/**' && pnpm typecheck && pnpm lint && pnpm format:check`,
      dann `pnpm --filter @bdas/web build && pnpm e2e`.
- [x] **Schritt 3: Abnahme** - Flag aus: `/federal/newsletter` ist 404, der Nav-Eintrag verschwindet, kein Board-Bereich ist kaputt. - Ein Nicht-Board-Konto kommt an keine der beiden URLs. - Kennzahlen und Tabelle widersprechen sich nicht. - Eine Person mit Konto erscheint mit ihrer **aktuellen** Kontoadresse, nicht mit dem gespeicherten Dublettenschlüssel. - Zwei Zeilen auf dieselbe aufgelöste Adresse erscheinen einmal, die Zeile mit Konto gewinnt (§4). - Ein Abonnent mit Konto zeigt seine Gruppe; wechselt er die Gruppe, zeigt die Liste die neue. - Eine anonyme Zeile zeigt bei Gruppe einen Gedankenstrich und stürzt nicht ab. - Die CSV öffnet sich in Excel mit korrekten Umlauten. - Kein Inline-Hex, -Radius, -Schatten, keine Inline-Dauer.
- [x] **Schritt 4: Commit + PR.** `/security-review` anfordern: Der PR ist
      weder auth noch payments noch files und fällt damit nicht unter die
      Regel aus CLAUDE.md §4 — aber er stellt eine Liste personenbezogener
      Daten als Datei bereit, und das ist die Art von Fläche, für die die Regel
      gedacht ist.

---

## Was danach kommt

Damit ist der Fünf-PR-Schnitt aus §12 abgearbeitet. Offen bleiben die Pflichten
und das Vertagte:

- **Aufbewahrung (§10):** Löschung des Consent-Log-Eintrags drei Jahre nach
  Ende des Abonnements. Kein Job vorhanden; `vercel.json` fährt bereits
  `files-sweep` als Muster.
- **Kontolöschung koppeln (§10):** Abonnement und Protokoll fallen mit. Es gibt
  heute keine Kontolöschung — eine gekoppelte Pflicht, kein heutiges Loch.
- **Die Spec liegt nicht auf `main`,** sondern nur auf
  `docs/newsletter-modul-spec`; der Branch `docs/newsletter-datenschutz-baustein`
  hat zwei ungemergte Verfeinerungen.
- **Der Versand** existiert nicht und hat keine Spec (§14). Nach diesem PR gibt
  es eine gepflegte Liste und keinen Weg, ihr etwas zu schicken. Dort gehört
  der Abmeldelink in die Fußzeile jeder Ausgabe.

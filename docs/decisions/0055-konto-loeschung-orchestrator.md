# ADR 0055 — Konto-Löschung: Orchestrator, Lease und Schrittbuch

**Status:** Accepted
**Date:** 2026-09-25
**Affects:** `modules/auth`, `apps/web/lib/account-deletion-composition.ts`, `apps/web/app/api/cron/account-deletion-sweep`, `core/storage`, `modules/blog`, `modules/files`, `modules/notifications`, `vercel.json`
**Builds on:** ADR 0044 (`auth.user.deleted`), ADR 0054 (Datenexport), Design-Spec Kontolöschung §2, §3, §5

## Kontext

Nach Ablauf der 30 Tage muss der Cron ein Konto unwiderruflich löschen (Art. 17 DSGVO). Die Löschung
berührt Storage-Objekte, Zeilen in fünf Modulen und eine Bestätigungs-Mail, kann also mittendrin
abbrechen und läuft auf überlappenden Cron-Ticks. Die Spec (§5) beschreibt den Ablauf als „Orchestrator-
Funktion in `auth`"; `files`, `blog`, `events` und `notifications` hängen aber selbst von `auth` ab.

## Entscheidung

1. **Schritte werden injiziert, `auth` kennt kein anderes Modul.** `runAccountDeletionSweep(db, deps)`
   liegt in `modules/auth` (besitzt `account_deletion_*`) und bekommt die Modul-Schritte als
   `DeletionStep[]` und die Bestätigungs-Mail als `CompletionMail`. Ein Import `auth → files` wäre ein
   Zyklus (Rule 3) und ein Verstoß gegen Rule 2. Die Verdrahtung steht in
   `apps/web/lib/account-deletion-composition.ts`.
2. **Schrittfolge fest:** `files` → `blog` → `profile_media` → `events` → `notifications` → `auth` →
   `email_c`. Die Modul-Schritte brauchen das noch vorhandene Konto (Member-Id-Auflösung) und laufen
   deshalb vor `auth`. `auth` und `email_c` sind reservierte Namen der Engine; eine Schrittliste, die
   sie verwendet, wird abgewiesen. Jeder `run` muss idempotent sein, weil sein Vermerk erst danach
   geschrieben wird.
3. **Lease statt Sperre.** Ein Request wird mit einem einzigen `UPDATE … RETURNING` beansprucht
   (`status → in_progress`, `claimed_until = now + 15 min`). Zwei überlappende Sweeps führen einen
   Request genau einmal aus; eine abgelaufene Lease wird von einem späteren Lauf übernommen. Ein
   Batch umfasst 5 Requests, bereits gescheiterte kommen zuletzt, damit hängende Zeilen frische nicht
   verdrängen.
4. **Der Claim beendet das Abbruchfenster.** `cancelAccountDeletion` bewegt nur `pending`-Zeilen. Wer
   den Claim gewinnt, entscheidet: Bricht der Nutzer zuerst ab, tut der Sweep nichts; hat der Sweep
   geclaimt, ist der Reaktivierungslink tot. Ein `pending`-Request wird nur geclaimt, solange das
   Konto `pending_deletion` ist. Solange ein Request `in_progress` ist, verweigert
   `requestAccountDeletion` eine neue Anfrage.
5. **Schrittbuch.** Jeder erledigte Schritt steht in `account_deletion_steps`; ein wiederholter Lauf
   setzt beim ersten unvermerkten Schritt fort. Stürzt der Lauf zwischen `deleteAccount` und dem
   `auth`-Vermerk ab, erkennt der Retry das fehlende Konto als erledigt, aber nur, wenn alle
   Modul-Schritte vermerkt sind; sonst bricht er mit Schritt `guard` ab, weil ohne Konto keine Modul-Id
   mehr aufgelöst werden kann.
6. **Nie ein aktives Konto löschen.** Steht der Nutzer einer `in_progress`-Zeile nicht auf
   `pending_deletion` (Reaktivierung, manueller Eingriff), läuft kein Schritt, die Zeile scheitert mit
   `guard`. Der Zustand bleibt bewusst dauerhaft blockiert (siehe Betriebsanleitung); eine
   automatische Auflösung wäre riskanter als die Blockade.
7. **E-Mail C und Snapshot.** E-Mail und Name werden im Request gespeichert und erst nach dem Versand
   geleert, in derselben Transaktion, die den Request auf `completed` setzt. Ein Fehlversand wird
   täglich wiederholt; **7 Tage nach `scheduled_purge_at`** wird ohne Mail abgeschlossen und der
   Snapshot trotzdem geleert. Fehlt der Name, geht die Mail mit dem Fallback „Gast" raus: Die
   Löschbestätigung ist rechtlich relevant, eine unpersönliche Mail besser als keine. Der Guest-Versand
   protokolliert `to_email`, `deleteLogForMember` erreicht diese Zeile nicht; die Composition löscht
   sie nach jedem Versand (auch nach einem fehlgeschlagenen) mit `deleteLogEntry`.
8. **Keine personenbezogenen Daten in Fehlern.** `last_error` speichert `<schritt>: <meldung>`, gekürzt
   auf 500 Zeichen, mit E-Mail und Name des Snapshots als `[redacted]`. Die Cron-Antwort enthält nur
   `requestId` und `step`.
9. **Cron-Route.** `GET /api/cron/account-deletion-sweep`, täglich 04:00 UTC (`vercel.json`), hinter
   `Authorization: Bearer ${CRON_SECRET}` (ohne gesetztes Secret immer 401) und dem Flag
   `account_deletion`. Sie antwortet 500, wenn ein Request scheitert, damit der Cron-Lauf rot wird.
10. **Alle beteiligten Module müssen verdrahtet sein.** Die Route verlangt zusätzlich die Flags
    `files`, `notifications` und `newsletter`; fehlt eines, antwortet sie 500 mit `missing` und fasst
    nichts an. Grund: Ohne Verdrahtung ist der Schritt ein stiller No-op (der `MemberIdResolver` liefert
    `null`), das Konto würde als gelöscht markiert, die Storage-Objekte blieben verwaist, E-Mail C ginge
    nur auf die Konsole, und die Newsletter-Zeile überlebte.
11. **Newsletter ohne eigenen Schritt.** Das Newsletter-Modul löscht Abo, Consent-Log und Prompts über
    `auth.user.deleted`, das `deleteAccount` veröffentlicht; die Route ruft dafür `bootNewsletter()`
    auf. Der Handler ist in `safe()` gewrappt (er darf die Bestätigung eines Nutzers nie scheitern
    lassen) und wird deshalb bei einem Fehler nicht wiederholt.
12. **Storage-Lecks geschlossen.** `StorageClient.deleteByPrefix` löscht rekursiv alles unter genau
    `<segment>/` und verweigert jede andere Prefix-Form (leer, `/`, `..`), damit ein fehlerhafter
    Aufruf keinen Bucket leert. Genutzt für Blog-Medien (`blog-media`) und Profilfotos (`profile-media`),
    beide mit Schlüsseln `${userId}/<uuid>.<ext>`. Der Files-Purge sperrt jede Ordnerzeile vor der
    Leer-Prüfung (`FOR UPDATE`), sodass ein gleichzeitiger Upload nicht mit kaskadiert wird.

## Konsequenzen

- Löschungen laufen erst, wenn `account_deletion`, `files`, `notifications` und `newsletter` an sind.
  Das ist gewollt: Vor dem Scharfschalten müssen alle beteiligten Module aktiv sein.
- Doppelte E-Mail C ist möglich, wenn eine Lease nach dem Versand, aber vor dem Abschluss abläuft
  (Minor, akzeptiert). Ebenso, wenn `deleteLogEntry` nach dem Versand scheitert: Der Retry sendet erneut,
  statt die Adresse im Log stehen zu lassen.
- Der Newsletter-Cleanup hängt an einem einmaligen Bus-Event und hat zwei Lücken: Ein Fehler im
  Handler wird nur mit `console.error` geloggt und nicht wiederholt (`auth` gilt trotzdem als erledigt),
  und stürzt ein Lauf zwischen `deleteAccount` und dem `auth`-Vermerk ab, veröffentlicht der Retry
  `auth.user.deleted` nicht erneut, weil das Konto schon fehlt. In beiden Fällen bleibt das Abo samt
  Adresse stehen, ohne dass der Sweep es merkt. Restrisiko; ein eigener, wiederholbarer
  Newsletter-Schritt vor `auth` würde beides beseitigen und ist ein Folgethema. Bis dahin bei
  Verdacht: `select * from newsletter_subscribers where user_id = '<gelöschte id>' or email = '<adresse>'`
  und die Zeile von Hand löschen (das Consent-Log geht per Cascade mit).
- Die Engine kennt keine Reihenfolge außerhalb der übergebenen Liste; wer einen Schritt ergänzt,
  ergänzt ihn in `buildDeletionSteps` und im Test der Composition.

## Betriebsanleitung

Übersicht offener oder hängender Requests:

```sql
select id, user_id, status, scheduled_purge_at, claimed_until, last_error
from account_deletion_requests
where status = 'in_progress'
order by scheduled_purge_at;
```

`last_error` beginnt mit dem Schritt (`files:`, `blog:`, `profile_media:`, `events:`,
`notifications:`, `auth:`, `email_c:`, `guard:`). Eine Lease (`claimed_until` in der Zukunft) heißt:
ein Lauf arbeitet gerade; nicht eingreifen. Fehler in einem Modul-Schritt oder in `email_c`
verschwinden von selbst, sobald die Ursache behoben ist (Lease abgelaufen oder `release` erfolgt, der
nächste Lauf setzt fort).

**Hängender `in_progress`-Fall mit aktivem Konto (`guard: account is not pending deletion`).**
Der Nutzer wurde reaktiviert oder von Hand auf `active` gesetzt, die Zeile blieb `in_progress`. Der
Sweep löscht diesen Nutzer nie, und `requestAccountDeletion` verweigert ihm eine neue Anfrage, bis die
Zeile bereinigt ist. Vorgehen:

1. Prüfen, dass das Konto wirklich aktiv ist und bleiben soll:
   `select id, status from auth_users where id = '<user_id>';` muss `active` liefern. Nicht bereinigen,
   solange der Nutzer `pending_deletion` ist; dann gehört die Zeile dem Sweep.
2. Prüfen, welche Schritte schon gelaufen sind (deren Daten sind bereits gelöscht und nicht wiederherstellbar):
   `select module_name, completed_at from account_deletion_steps where request_id = '<id>';`
   Den Nutzer darüber informieren, wenn Dateien, Blog-Inhalte oder Profilfotos betroffen sind.
3. Zeile abschließen, Snapshot und Reaktivierungstoken leeren:

   ```sql
   update account_deletion_requests
   set status = 'cancelled', cancelled_at = now(), claimed_until = null,
       email_snapshot = null, name_snapshot = null,
       reactivation_token_hash = null, reactivation_expires_at = null
   where id = '<id>' and status = 'in_progress';
   ```

   Danach kann der Nutzer die Löschung neu beantragen; die Schritte sind idempotent und holen nach.

**Konto fehlt, Modul-Schritte unvermerkt (`guard: account is gone but module steps are unrecorded`).**
Das Konto wurde außerhalb des Sweeps gelöscht, bevor alle Schritte liefen. Die Engine kann ohne Konto
keine Modul-Id mehr auflösen. Storage-Objekte unter `<user_id>/` in `blog-media` und `profile-media`
sowie Dateien des Mitglieds von Hand entfernen, dann die fehlenden Schritte mit
`insert into account_deletion_steps (id, request_id, module_name) values ('ads_<neu>', '<id>', '<name>') on conflict do nothing;`
vermerken; der nächste Lauf schließt ab.

## Offene Punkte

- **`cancelled`-Zeilen behalten E-Mail/Name-Snapshot** für immer. Folge-PR: Snapshot beim Abbruch leeren.
- **`deleteFolder`** (`modules/files/src/services/folder-writes.ts`) hat dasselbe Cascade-Race wie der
  Purge vor dem Fix. Folge-PR; der Helper `deleteFolderIfEmpty` ist dafür geschnitten.
- **Go-Live-Voraussetzung:** Die echte Storage-Löschung (Blog-Medien, Profilfotos, Files) einmal im
  Staging gegen echte Buckets ausführen (echte `remove()`-Semantik bei fehlenden oder verweigerten Pfaden).
  Unit-Tests können das nicht abdecken. Das Flag `account_deletion` bleibt bis PR9 (E2E) und diesem
  Trockenlauf aus.

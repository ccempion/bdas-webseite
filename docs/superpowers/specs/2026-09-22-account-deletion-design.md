# Konto-Löschung (DSGVO Art. 17) — Design

**Date:** 2026-09-22
**Status:** Approved (brainstorming)
**Baut auf:** ADR 0008 (GDPR-Haltung Phase 1 — Löschung auf Phase 6 verschoben, Export-Stub auf auth+members),
docs/bdas-platform-spec.md Zeile 494 (nicht-funktionale Anforderungen: 30-Tage-Kaskade, Dateizugriffs-Logs 90 Tage,
Zahlungsdaten nach Steuerrecht)
**Scope:** Vollständige Selbstbedienungs-Löschung mit 30-Tage-Frist über alle bestehenden Module (auth, members,
profile, events, files, blog, notifications, Sessions, Gruppenwechsel-Anträge) sowie Vervollständigung des
Datenexports (Art. 15) inkl. CSV. Betrifft `modules/auth`, `modules/members`, `modules/profile`, `modules/events`,
`modules/files`, `modules/blog`, `modules/notifications`, `core/feature-flags`, `apps/web`. Nicht Teil dieses
Scopes: "Sperren statt Löschen" für aufbewahrungspflichtige Daten (siehe §7) — Architektur bereitet es vor, baut
es aber nicht.

---

## 1. Ausgangslage

ADR 0008 §4 hat Konto-Löschung explizit auf "Phase 6" verschoben, weil damals die betroffenen Module (events,
files, blog, notifications) noch nicht existierten. Sie existieren jetzt. Der Datenexport deckt bis heute nur
auth+members als JSON ab; `docs/datenschutz/datenschutz-bestandsaufnahme.html` listet als fehlend genau:
Veranstaltungsanmeldungen/Anwesenheit, Dateien+Zugriffsprotokoll, Blogbeiträge+Meldungen, E-Mail-Protokoll,
Sitzungsdaten, Gruppenwechselanträge — sowie das CSV-Format, das Muster B verlangt.

Codebase-Bestandsaufnahme (siehe Recherche vom 2026-09-22):

- `auth` exportiert bereits `deleteAccount(db, userId)` — hartes Löschen von `auth_users`, über FK-Kaskaden
  räumt das bereits `members`, `profile`, Event-Anmeldungen/Warteliste, Rollen-Grants und
  Gruppenwechsel-Anträge automatisch mit ab. Bisher nur vom "Bundesvorstand löscht profillose Bewerber\*innen"-Flow
  genutzt (ADR 0044).
- `files.uploaded_by` ist `ON DELETE CASCADE` — eine reine DB-Kaskade würde Datei-**Zeilen** löschen, ohne die
  Storage-Blobs zu entfernen (Leck). `folders.created_by` ist `ON DELETE SET NULL` — das ist die vom Nutzer
  beschriebene Entkopplung.
- `blog.posts`/`post_comments` haben **keinen FK** zum Autor. Die heutige "Entkopplung" ist nur ein
  UI-Fallback (`author?.name ?? "BDAS-Mitglied"`), keine echte Datenlöschung.
- `core/events` ist ein synchroner, nicht-persistenter In-Process-Bus (`InProcessEventBus`, dokumentiert als
  "nicht durable, keine Queue"). Für eine unwiderrufliche, cron-ausgelöste Kaskade mit Retry-Bedarf ist das ein
  Risiko: ein Fehler in einem Subscriber hinterlässt sonst einen halb gelöschten Nutzer ohne Wiederaufnahme.
- Ein Cron-Mechanismus existiert bereits (`vercel.json` → `/api/cron/files-sweep`, `CRON_SECRET`-gated,
  Flag-Check, idempotenter Bootstrap+Sweep) — wiederverwendbares Muster für den 30-Tage-Sweep.
- `notifications.sendTransactional` löst den Empfänger über ein **lebendes** `members`-Lookup auf — funktioniert
  nicht für die Löschbestätigung (E-Mail C), die erst nach dem harten Löschen verschickt wird. Es gibt bereits
  `sendTransactionalToGuest(db, template, {email, name}, extra)` für Gast-E-Mails, das ohne Member-Lookup
  auskommt.
- `Notifier`/Resend-Treiber kennen kein `attachments`-Feld — nötig für den CSV-Anhang der Auskunfts-E-Mail (B).
- `file_access_log.member_id` ist `ON DELETE CASCADE` — kollidiert mit der 90-Tage-Aufbewahrungspflicht aus der
  Spec, sobald ein Nutzer gelöscht wird, unabhängig von Steuer-/Rechtsanspruchsdaten.
- `#162` (vom Nutzer referenzierte frühere Analyse) existiert weder als GitHub-PR/Issue auf `origin` noch in
  `docs/`. Dieses Dokument baut darauf **nicht** auf — es beginnt bei ADR 0008 und der aktuellen Codebase.

## 2. Entscheidungen

Diese vier wurden mit dem Nutzer (als Produktverantwortlichem für diese Session, analog ADR 0008) geklärt:

1. **Orchestrierung: direkter Aufruf, nicht Events.** `auth` ruft beim Ablauf der 30 Tage nacheinander die
   öffentliche `deleteForUser`-artige Funktion jedes Moduls auf, mit persistiertem Fortschritt pro Modul. Das
   weicht von der CLAUDE.md-Konvention "Module lösen Seiteneffekte über Events aus" ab — begründet, weil
   `core/events` synchron und nicht persistent ist und ein Fehler mittendrin bei einer unwiderruflichen Operation
   ohne Retry-Fähigkeit inakzeptabel ist. Raised und vom Nutzer akzeptiert statt stillschweigend umgangen
   (CLAUDE.md §1: Regelkonflikte offen ansprechen).
2. **Audit-Log: anonymisieren statt löschen.** `file_access_log.member_id` wird von `ON DELETE CASCADE` auf
   `ON DELETE SET NULL` umgestellt. Der Log-Eintrag bleibt 90 Tage erhalten, nur ohne Personenbezug. Das ist eine
   Migrationsänderung, keine neue Orchestrator-Logik — sie greift automatisch, sobald die finale
   `auth.deleteAccount()`-Kaskade durchläuft.
3. **Blog-Umfang: Beiträge + alle eigenen Kommentare hart löschen.** Sowohl eigene Beiträge (samt deren
   Kommentaren, die kaskadieren) als auch eigene Kommentare unter fremden Beiträgen werden hart gelöscht —
   konsistent mit der Vorgabe des Datenschutzbeauftragten "löschen, nicht anonymisieren".
4. **Abbruch per Reaktivierungs-Link.** Da `status = 'pending_deletion'` den Login blockiert (bestehender Check
   in `login.ts`), bekommt Nutzer\*in in E-Mail A einen tokenbasierten Reaktivierungslink (analog
   E-Mail-Verifizierung), der die Löschung storniert und den Account zurück auf `active` setzt.

Drei weitere Punkte mit begründetem Standardverhalten (vom Nutzer bestätigt):

5. **Vom Nutzer organisierte Events bleiben erhalten**, nur der Organisator-Bezug (`events.created_by`, kein FK)
   wird geleert. Begründung: das Event ist institutionelle Vereinsdatenlage, kein persönlicher Ausdruck wie ein
   Blogbeitrag — andere Behandlung als Blog ist beabsichtigt, nicht inkonsistent.
6. **Nur Selbstbedienung.** Board-/Admin-ausgelöste Löschung (z. B. eine Anfrage an privacy@) ist nicht Teil
   dieses Plans — als Folgethema notiert, nicht stillschweigend fallen gelassen.
7. **Die "Sollen deine Blogbeiträge mitgelöscht werden?"-Frage ist reine Transparenz.** Blog-Löschung ist wegen
   Entscheidung 3 immer verpflichtend; die Checkbox verzweigt kein Backend-Verhalten, sie informiert nur.

## 3. Datenmodell

Neue Migration in `modules/auth/migrations/` (auth besitzt bereits den Account-Lifecycle-State):

```sql
CREATE TABLE account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth_users(id), -- kein ON DELETE CASCADE: die Zeile muss die finale
                                            -- Löschung überleben (Audit-Trail + E-Mail-C-Versand)
  email_snapshot text NOT NULL,
  name_snapshot text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_purge_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | in_progress | completed | cancelled
  reactivation_token_hash text,
  reactivation_expires_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE account_deletion_steps (
  request_id uuid NOT NULL REFERENCES account_deletion_requests(id) ON DELETE CASCADE,
  module_name text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, module_name)
);
```

`account_deletion_steps` macht den Sweep idempotent: vor jedem Schritt wird geprüft, ob für
`(request_id, module_name)` bereits ein Eintrag existiert; wenn ja, wird der Schritt übersprungen. Ein
abgebrochener Cron-Lauf kann so gefahrlos erneut starten.

Gleiche Migrations-Batch: `file_access_log.member_id` FK von `ON DELETE CASCADE` auf `ON DELETE SET NULL`
(Entscheidung 2).

`auth_users.status` ist bereits ein freies `text`-Feld (kein Enum/CHECK) — `'pending_deletion'` ist ein neuer
Wert, keine Schemaänderung nötig. Der bestehende Login-Check `status !== 'active'` blockiert damit automatisch.

## 4. Ablauf Tag 0 — Auslösen (synchron, in der Anfrage)

1. UI: "Konto löschen"-Button in `/account/einstellungen` (bestehende Card-Struktur), öffnet die bestehende
   `Dialog.tsx` (kein natives `confirm()`), zeigt Sicherheitsabfrage + informativen Hinweis zu Blogbeiträgen
   (Entscheidung 7).
2. Server Action:
   - setzt `auth_users.status = 'pending_deletion'`
   - ruft neue `auth.revokeAllSessionsForUser(db, userId)` (Export der bisher in `password-reset.ts` inline
     genutzten Logik)
   - legt `account_deletion_requests`-Zeile an: `scheduled_purge_at = now() + 30 Tage`, Snapshots aus dem
     aktuellen `auth_users`/`members`-Stand
   - versendet E-Mail A (Eingangsbestätigung, sofort) inkl. Reaktivierungslink

## 5. Ablauf Tag 30 — Sweep (Cron)

Neue Route `/api/cron/account-deletion-sweep`, gleiches Muster wie `files-sweep` (Bearer-Secret, Flag-Check,
idempotenter Bootstrap). Orchestrator-Funktion in `auth` (Entscheidung 1):

```
für jede account_deletion_requests-Zeile mit status='pending' und scheduled_purge_at <= now():
  status → 'in_progress'
  Schritte (jeweils übersprungen, falls schon in account_deletion_steps vermerkt):
    1. files.deleteFilesByMember(db, userId)      — Storage-Blobs + Zeilen + Ordner (echtes Löschen,
                                                      ersetzt die heutige SET-NULL-Entkopplung)
    2. blog.deleteContentByAuthor(db, userId)      — eigene Beiträge (kaskadiert deren Kommentare)
                                                      + eigene Kommentare unter fremden Beiträgen
    3. events.clearOrganizerForUser(db, userId)    — organisierte Events bleiben, Organisator-Bezug geleert
    4. notifications.deleteLogForMember(db, userId) — Versandprotokoll (oder: bestehende FK deckt es
                                                      bereits ab — wird in der Umsetzungs-PR geprüft)
    5. auth.deleteAccount(db, userId)              — bestehende Funktion; FK-Kaskaden räumen jetzt
                                                      members/profile/Event-Anmeldungen/Rollen-Grants/
                                                      Gruppenwechsel-Anträge/verbliebene Datei-Zeilen und
                                                      anonymisieren file_access_log (Entscheidung 2)
  status → 'completed', completed_at = now()
  E-Mail C (Löschbestätigung) über sendTransactionalToGuest mit email_snapshot/name_snapshot
```

Reihenfolge ist bewusst: Schritte 1–4 laufen **vor** dem finalen `deleteAccount()`, weil sie App-Code brauchen
(Storage-Löschung, Blog hat keinen FK, Events sollen nicht kaskadieren). Schritt 5 ist der bestehende
FK-Kaskaden-Mechanismus für alles, was DB-seitig sauber abgedeckt ist.

## 6. Datenexport-Vervollständigung (Art. 15)

Jedes betroffene Modul bekommt ein `exportForUser(db, userId)` in seiner öffentlichen Schnittstelle (events,
files — nur Metadaten, keine Blob-Inhalte —, blog, notifications, Sessions). Format:

- JSON bleibt wie heute die Grundausgabe.
- Neuer CSV-Modus (Muster B) bündelt eine CSV-Datei pro Kategorie in einem ZIP — eine einzelne flache CSV über
  heterogene Tabellen ergibt keinen Sinn.
- `Notifier`/Resend-Treiber bekommen ein `attachments`-Feld; E-Mail B hängt das ZIP an.

## 7. Vorbereitung für "Sperren statt Löschen" (gesperrt, nicht Teil dieses Plans)

Die Schrittliste des Orchestrators (Abschnitt 5) ist ein einfaches geordnetes Array aus
`(moduleName, purgeFn)`. Eine spätere "Kategorie X aufbewahren statt löschen"-Funktion reiht sich als weiterer
Schritt ein, der anonymisiert/markiert statt löscht — ohne die Reihenfolge oder Retry-Logik anzufassen. Die
Audit-Log-Anonymisierung (Entscheidung 2) ist bereits eine konkrete Instanz dieses Musters. Diese PR-Reihe baut
keine generische "Kategorie sperren"-Konfiguration — nur die Struktur, die sie später aufnehmen kann.

## 8. E-Mails

| # | Zweck | Zeitpunkt | Versandweg | Anhang |
|---|---|---|---|---|
| A | Eingangsbestätigung + Reaktivierungslink | sofort bei Auslösen | `sendTransactional` (Member existiert noch) | — |
| B | Auskunft (Art. 15) | auf Abruf über `/account/datenexport` | `sendTransactional` oder Download | CSV-ZIP |
| C | Löschbestätigung | nach dem Sweep | `sendTransactionalToGuest` (Snapshot, Member existiert nicht mehr) | — |

## 9. Feature-Flag

Neues Flag `account_deletion` (Rule 6) gated Button, Routen und den Cron-Endpunkt unabhängig von `auth`/
`members` — kann dark ausgeliefert werden, bis die drei E-Mails in Staging verifiziert sind.

## 10. Testing-Ansatz

- Jedes Modul: Integrationstest seiner neuen `deleteForUser`/`exportForUser`-Funktion gegen echtes Postgres
  (Docker), keine Mocks (Rule 5).
- Orchestrator: Test für Idempotenz (Sweep zweimal mit simuliertem Fehler nach Schritt 2 laufen lassen, prüfen
  dass Schritt 1–2 nicht doppelt laufen und 3–5 nachgeholt werden).
- E2E: kompletter Ablauf Auslösen → Sperre wirkt (Login abgelehnt) → Reaktivierung funktioniert → (zweiter Lauf)
  Sweep → Konto und alle Modul-Daten weg → E-Mail C.
- `/security-review` auf jeder PR, die löscht (Files-, Blog-, Orchestrator-, Auth-Löschung) — unwiderrufliche
  Datenlöschung.

## 11. Offene Folgethemen (nicht in diesem Scope)

- "Sperren statt Löschen" für aufbewahrungspflichtige Daten (Steuer, Rechtsansprüche) — wartet auf externe
  Rechtsklärung.
- Board-/Admin-ausgelöste Löschung außerhalb der Selbstbedienung.
- `#162` — referenzierte frühere Analyse nicht auffindbar; falls sie auftaucht, gegen dieses Dokument abgleichen.

# ADR 0053 — Staging-Umgebung auf dashboard.bdas.de

**Status:** Accepted
**Date:** 2026-09-23
**Affects:** `apps/web`, `.github/workflows/staging.yml`, Vercel-Umgebungsvariablen (Preview)
**Supersedes:** die Staging-Zeile in ADR 0001 (dort geplant, nie gebaut)

## Kontext

Es gab keine Testumgebung. Die Vercel-Previews liefen mit den Produktionswerten für
`DATABASE_URL`, `SUPABASE_*`, `RESEND_API_KEY` und `SSO_JWT_SECRET`: Wer eine Preview
ausprobierte, legte echte Konten an, lud Dateien in den echten Bucket, verschickte echte E-Mails
und verbrauchte das Verbindungsbudget der Produktionsdatenbank (Ausfall am 2026-08-09). Weil der
JWT-Schlüssel geteilt war, galt eine in einer Preview ausgestellte Anmeldung auch auf bdas.de.

## Entscheidung

1. **Jede Vercel-Preview ist Staging.** Sie läuft gegen ein eigenes Supabase-Projekt
   (`bdas-staging`, Free Tier, Frankfurt) mit eigener Datenbank und eigenem Bucket. Alle
   Preview-Variablen, die auf Produktion zeigten, zeigen dorthin; `SSO_JWT_SECRET` und
   `CRON_SECRET` sind eigene Werte.
2. **Feste Adresse `dashboard.bdas.de`** zeigt den Branch `staging`. Der Workflow
   `staging.yml` spielt nach grünem CI auf `main` zuerst die Migrationen in die
   Staging-Datenbank ein und setzt danach `staging` auf denselben Commit. Braucht eine Preview
   Migrationen eines noch nicht gemergten Branches, startet man den Workflow von Hand für
   diesen Branch.
3. **Passwortsperre.** `apps/web/middleware.ts` verlangt auf jeder Preview das Passwort aus
   `STAGING_PASSWORD` (Basic Auth, Benutzername beliebig). Fehlt die Variable, liefert Staging
   nichts aus (503). Produktion durchläuft die Sperre nie. Dazu `X-Robots-Tag: noindex` und
   ein `robots.txt`, das alles sperrt.
4. **E-Mails nur ins Test-Postfach.** Auf Staging gehen alle E-Mails an `EMAIL_REDIRECT_TO`,
   der Betreff nennt den ursprünglichen Empfänger. Fehlt die Variable, wird nichts verschickt,
   sondern nur protokolliert. Beides gilt für die Auth- und die Notifications-Mails.
5. **Banner.** Jede Seite auf Staging zeigt oben „TESTUMGEBUNG". `dashboard.bdas.de` war
   früher die echte Mitgliederadresse; alte Links und Lesezeichen führen jetzt auf Staging.
6. **Alle Feature-Flags an**, damit neue Module vor dem Start ausprobiert werden können.
7. **Startdaten:** nur die Gruppenliste (`pnpm groups:seed`). Alles Weitere legen die
   Testenden selbst an. Staging darf jederzeit geleert werden.
8. **Keine Supabase-Data-API auf Staging.** Die App spricht die Datenbank nur serverseitig an;
   die automatische REST-Schnittstelle ist im Staging-Projekt abgeschaltet. Die in Produktion
   von Hand gesetzte Row-Level Security ist deshalb auf Staging nicht nachgebaut.

## Konsequenzen

- Vercel-Crons laufen nur in Produktion; auf Staging läuft der Files-Sweep nicht.
- Staging ist ein Vercel-Preview-Deployment: `VERCEL_ENV === "preview"` ist das einzige Signal
  für „das ist Staging". Lokal und im CI ist keins davon aktiv.
- Die Staging-Datenbank kann Migrationen gemergter Branches enthalten, die `main` wieder
  verworfen hat. Dann wird sie neu aufgesetzt, statt repariert.
- Row-Level Security, die nur in der Produktionsdatenbank existiert, bleibt eine offene
  Aufgabe: Ein neu aufgesetztes Projekt bekommt sie nicht aus dem Repo.

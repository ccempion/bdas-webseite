# ADR 0051 — Der Bestätigungslink legt die Sitzung an

**Status:** Accepted
**Date:** 2026-09-22
**Affects:** `modules/auth`, `apps/web`
**Spec:** [`docs/superpowers/specs/2026-09-22-einstieg-korrekturen-design.md`](../superpowers/specs/2026-09-22-einstieg-korrekturen-design.md)

## Kontext

Der Bestätigungslink führte auf die Anmeldung, ohne ein Wort zur Bestätigung. Wer gerade sein
Passwort gesetzt hat, musste es sofort wieder eintippen, und der Einstieg riss genau an der Stelle
ab, an der er weitergehen sollte.

## Entscheidung

1. Bei der ersten Einlösung legt `verifyEmail` die Sitzung an und gibt ihr Token zurück. Die
   Einlösung liegt in einem Route Handler (`apps/web/app/verifizieren/[token]/route.ts`), der das
   Sitzungs-Cookie setzt und auf das serverseitig berechnete Ziel weiterleitet: Next.js lässt
   `Set-Cookie` nur aus einem Handler oder einer Server Action zu.
2. Ein schon benutzter oder abgelaufener Link legt keine Sitzung an. Gültigkeit, Einmaligkeit und
   Rate-Limits bleiben unverändert; beide Fälle landen auf `/verifizieren` und erklären dort, was zu
   tun ist.
3. Es gibt keine exportierte Funktion, die eine Sitzung für eine beliebige Nutzerkennung anlegt.
   Die Sitzung entsteht innerhalb des Auth-Moduls an genau der Stelle, die den Token prüft.

## Konsequenzen

- Der Link in der Mail ist ein Anmeldemittel. Wer ihn weitergibt, gibt einen Zugang weiter, bis er
  eingelöst ist oder abläuft.
- Das Weiterleitungsziel kommt nie aus der URL, damit der Link nicht zum offenen Umleiter wird.
- Testhilfen im E2E melden nur noch an, wenn keine Sitzung im Browser liegt.

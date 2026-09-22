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
2. Angemeldet wird nur der Browser, der die Registrierung begonnen hat. Er trägt den Token in einem
   eigenen HttpOnly-Cookie; stimmt er nicht mit dem Link überein, wird das Konto trotzdem bestätigt,
   aber ohne Sitzung. Sonst könnte jemand seinen eigenen Link verschicken und fremde Leute ihre
   Daten in sein Konto eintragen lassen.
3. Ein schon benutzter oder abgelaufener Link legt keine Sitzung an. Gültigkeit, Einmaligkeit und
   Rate-Limits bleiben unverändert; alle drei Fälle landen auf `/verifizieren` und erklären dort, was
   zu tun ist.
4. Der Token liegt nur noch als SHA-256-Hash in `auth_email_verifications` (Migration 0005), wie das
   Reaktivierungs-Token aus ADR 0045. Ein Anmeldemittel gehört nicht im Klartext in eine Tabelle.
5. Es gibt keine exportierte Funktion, die eine Sitzung für eine beliebige Nutzerkennung anlegt.
   Die Sitzung entsteht innerhalb des Auth-Moduls an genau der Stelle, die den Token prüft.

## Konsequenzen

- Der Link in der Mail ist im registrierenden Browser ein Anmeldemittel. Auf einem anderen Gerät
  bestätigt er nur, dort führt die Anmeldung weiter.
- Das Weiterleitungsziel kommt nie aus der URL, damit der Link nicht zum offenen Umleiter wird.
- Die Datenbank kennt den Token nicht mehr im Klartext. Die E2E-Hilfen holen ihn aus dem Cookie des
  Browsers, der sich registriert hat, und melden nur noch an, wenn keine Sitzung im Browser liegt.
- Offen: `auth_password_resets` und `auth_email_changes` speichern ihre Tokens weiterhin im
  Klartext. Das ist älter als diese Entscheidung und gehört in einen eigenen PR.

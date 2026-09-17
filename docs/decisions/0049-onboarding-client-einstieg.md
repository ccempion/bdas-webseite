# ADR 0049 — `@bdas/onboarding/client`: ein zweiter, browsertauglicher Einstieg

**Status:** Accepted
**Date:** 2026-09-17
**Affects:** `modules/onboarding`, `apps/web`
**Spec:** [`docs/superpowers/specs/2026-09-16-onboarding-wizard-design.md`](../superpowers/specs/2026-09-16-onboarding-wizard-design.md) §5.1

## Kontext

Der Onboarding-Wizard rechnet den Ablauf im Browser, damit jede Antwort sofort den nächsten
Bildschirm zeigt; der Server rechnet denselben Ablauf beim Speichern nach (ADR 0048). Die
Client-Komponenten brauchen dafür `FLOW`, `walk`, `sanitizeAnswers`, `fillText` und Co. zur
Laufzeit, nicht nur als Typen.

CLAUDE.md §1 Regel 8 sieht genau ein `index.ts` als öffentliche Oberfläche vor. Das `index.ts`
von `@bdas/onboarding` exportiert aber auch die Dienste; `completeJourney` importiert
`@bdas/members`, und darüber erreicht der Import `@bdas/auth` und `node:crypto`. Der Web-Build
bricht ab, sobald eine Client-Komponente zur Laufzeit aus `@bdas/onboarding` importiert. Bisher
importieren Client-Komponenten aus Modulen nur Typen.

## Entscheidung

1. **`@bdas/onboarding` bekommt einen zweiten Einstieg `./client`** (`src/client.ts`, in
   `package.json#exports`). Er exportiert nur reinen Ablauf-Code: keine Datenbank, keine Dienste,
   kein anderes Modul.
2. **Alles in `client.ts` ist auch aus `index.ts` exportiert.** Der Client-Einstieg ist eine
   Teilmenge, keine zweite Oberfläche mit eigenem Inhalt. Server-Code importiert weiter aus
   `@bdas/onboarding`.
3. **Ein Test sichert beides ab** (`src/client.test.ts`): dieselben Werte wie `index.ts`, und die
   Dateien hinter dem Einstieg importieren nichts außer einander und `./types`.
4. **Die Ausnahme gilt nur für dieses Modul.** Braucht ein weiteres Modul Laufzeitcode im Browser,
   ist das eine eigene Entscheidung.

## Konsequenzen

- Regel 8 bleibt im Kern erhalten: private Dateien sind weiter nicht importierbar
  (`import/no-internal-modules` verbietet `@bdas/*/src/**`), und es gibt genau einen Ort, der die
  öffentliche Oberfläche festlegt.
- Kein Server-Code und kein Duplikat der Ablauflogik im Browser-Bundle.
- Wer eine Datei hinter `client.ts` um einen Import erweitert, bricht den Test und muss hier
  nachsehen.

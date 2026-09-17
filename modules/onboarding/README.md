# @bdas/onboarding

Der geführte Einstieg: erst ein paar Fragen, daraus ein Nutzertyp, dann Konto,
dann die passenden Angaben, am Ende die richtige Bewerbung (Spec:
`docs/superpowers/specs/2026-09-16-onboarding-wizard-design.md`). Flag:
`BDAS_FLAG_ONBOARDING`.

## Eigene Tabelle

| Tabelle               | Zweck                                                         |
| --------------------- | ------------------------------------------------------------- |
| `onboarding_journeys` | Eine Zeile pro Konto: Antworten, Ergebnis, Status, Antrags-ID |

Nichts außerhalb dieses Moduls liest oder schreibt sie (CLAUDE.md §1 Regel 1).
RLS ist an; die App erreicht die Tabelle nur über die direkte Postgres-Verbindung.

## Der Ablauf ist Konfiguration

`src/flow.ts` enthält Fragen, Regeln und Ergebnisse als reine Daten.
`nextStep(flow, answers, env)` läuft die Regeln ab — im Browser für sofortige
Reaktion, auf dem Server als maßgebliche Prüfung. `validate-flow.test.ts` prüft
die echte Konfiguration: Regeln ins Leere, unerreichbare Fragen, Kreise,
Platzhalter vor ihrer Frage.

Eine neue Frage ist eine Änderung an `flow.ts`. Wer eine Frage entfernt oder
umbenennt, erhöht `version`; gespeicherte Antworten zu verschwundenen Fragen
fallen still heraus.

Der Browser importiert den Ablauf aus `@bdas/onboarding/client` (ADR 0049), nicht
aus `@bdas/onboarding`: das Haupt-`index.ts` zieht über die Dienste Server-Code
nach. Der Client-Einstieg ist eine Teilmenge davon; `client.test.ts` sichert ab,
dass die Dateien dahinter nichts außer einander importieren.

## Sicherheitsregel

`completeJourney` beantragt ohne den App-Guard `requireSelfServiceGroup`, also
auch an `netzwerk` und `affiliate`. Das ist nur sicher, weil das Ziel
ausschließlich aus `resolveTarget` kommt: die Netzwerk- und BDAJ-Zeile aus
`loadFlowEnv`, die gewählte Gruppe nur, wenn sie in der serverseitigen Liste
aktiver Hochschulgruppen steht (ADR 0048). Wer hier eine Gruppen-ID von außen
annimmt, öffnet einen Weg, sich selbst in eine Partnerorganisation zu beantragen.

## Abhängigkeiten

- `@bdas/groups` — `listGroups`, `getGroupBySlug` (in `loadFlowEnv`)
- `@bdas/members` — `changePrimaryGroup`, `getMember` (in `completeJourney`)
- Das Profil (`@bdas/profile`) speichert der Aufrufer vor `completeJourney`.

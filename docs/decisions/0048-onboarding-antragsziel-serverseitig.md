# ADR 0048 — Onboarding: das Antragsziel wird serverseitig abgeleitet

**Status:** Accepted
**Date:** 2026-09-17
**Affects:** `modules/onboarding`, `apps/web`
**Spec:** [`docs/superpowers/specs/2026-09-16-onboarding-wizard-design.md`](../superpowers/specs/2026-09-16-onboarding-wizard-design.md)

## Kontext

ADR 0046 lässt den Bundesvorstand über Anträge an die `netzwerk`-Gruppe entscheiden und hält fest,
dass die Gruppenauswahl im Profil auf Hochschulgruppen beschränkt bleibt
(`apps/web/lib/self-service-group.ts`), bis die Registrierung überarbeitet ist. Der
Onboarding-Wizard ist diese Überarbeitung: er muss an `netzwerk` (Förderer*innen, Studierende ohne
Gruppe) und an die `affiliate`-Gruppe BDAJ beantragen können.

`changePrimaryGroup` selbst prüft die Gruppenart nicht. Wer den App-Guard auslässt und eine
Gruppen-ID aus dem Browser durchreicht, erlaubt jedem, sich bei jeder Gruppe zu bewerben —
die Lehre aus dem Events-Befund: den Ziel-Zustand autorisieren, nicht nur den Ausgangszustand.

## Entscheidung

1. **`completeJourney` ruft `changePrimaryGroup` ohne `requireSelfServiceGroup` auf.**
2. **Das Ziel kommt ausschließlich aus `resolveTarget`.** Die Netzwerk- und BDAJ-Zeile liest
   `loadFlowEnv` über `@bdas/groups` (Slug und Art müssen passen, Status `active`). Die einzige
   Gruppen-ID aus dem Browser — die gewählte Hochschulgruppe — zählt nur, wenn sie in der
   serverseitigen Liste aktiver Hochschulgruppen steht. Sonst wird das Ergebnis
   `student_ohne_gruppe`.
3. **Das Ergebnis rechnet der Server nach**, bei der Registrierung (`startJourney`) und beim
   Abschicken (`completeJourney`), mit der jeweils aktuellen Lage.
4. **Die Journey wird über den angemeldeten Account geladen**, nie über eine übergebene ID; das
   übergebene Mitglied muss zu diesem Account gehören.
5. **`nextStep` bekommt den Einstiegskontext nicht.** Vorausfüllen kann so strukturell keine
   Frage beantworten.

## Konsequenzen

- Der Guard `requireSelfServiceGroup` bleibt für das Profil unverändert.
- Fehlt die BDAJ- oder Netzwerk-Zeile, bleibt die Journey offen („Wir melden uns, sobald es
  losgeht"); es entsteht kein Antrag ins Leere.
- Jede künftige Änderung an `resolveTarget` oder `loadFlowEnv` braucht `/security-review`.

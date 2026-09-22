# ADR 0052 — BDAJ-Mitglieder statt Funktionär\*innen

**Status:** Accepted
**Date:** 2026-09-22
**Affects:** `modules/onboarding`, `modules/profile`, `apps/web`
**Spec:** [`docs/superpowers/specs/2026-09-22-einstieg-korrekturen-design.md`](../superpowers/specs/2026-09-22-einstieg-korrekturen-design.md)

## Kontext

ADR 0047 schneidet die Rechte für BDAJ-Leute zu und nennt sie durchgehend „Funktionär\*innen".
Im Einstieg las sich das als Bedingung: „Für Funktionär\*innen des BDAJ". Gemeint war nie eine
Einschränkung auf Vorstandsämter, sondern der Weg für alle, die in der BDAJ aktiv sind.

## Entscheidung

1. In allen Texten heißen sie „BDAJ-Mitglieder". Die Karte im Einstieg bleibt „Ich bin in der BDAJ
   aktiv", der Hinweis darunter wird „Für alle Mitglieder der BDAJ".
2. Die Auswahl der Funktion in Teil 3 bleibt unverändert (Vorstandsmitglied, Mitglied,
   Geschäftsstelle). Sie unterscheidet die Art des Zugangs, nicht die Berechtigung mitzumachen.
3. Der Rechte-Zuschnitt aus ADR 0047 bleibt gültig; nur die Sprache ändert sich.

## Konsequenzen

- Der Nutzertyp-Schlüssel `bdaj` und die Gruppenart `affiliate` bleiben, wie sie sind.
- Wer als BDAJ-Mitglied aufgenommen ist und zusätzlich in einer BDAS-Gruppe mitmachen will,
  wechselt die Hauptgruppe über den vorhandenen Gruppenantrag. Eine gleichzeitige Mitgliedschaft in
  zwei Gruppen bleibt ungelöst und ist bewusst nicht Teil dieses Durchgangs.

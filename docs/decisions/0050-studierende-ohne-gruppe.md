# ADR 0050 — Studierende ohne Gruppe behalten ihren Nutzertyp

**Status:** Accepted
**Date:** 2026-09-22
**Affects:** `modules/onboarding`, `modules/members`, `apps/web`
**Spec:** [`docs/superpowers/specs/2026-09-22-einstieg-korrekturen-design.md`](../superpowers/specs/2026-09-22-einstieg-korrekturen-design.md)

## Kontext

Der Einstieg führte Studierende, in deren Stadt es keine Gruppe gibt, als Förderer\*innen und
beantragte für sie die Netzwerk-Gruppe. Der Bildschirm sagte „Student\*in", die Datenbank sagte
„Förderer\*in". Für Gründung oder Beitritt anderswo gab es keinen Weg.

## Entscheidung

1. Der Nutzertyp bleibt `student`, die Hauptgruppe bleibt leer. Eine leere Hauptgruppe ist für
   diesen Weg der Normalfall, kein Fehler.
2. Nach einem Studienort ohne Gruppe fragt der Ablauf nach der Absicht: gründen, einfach dabei
   sein oder einer anderen Gruppe beitreten. Gründen und Dabeisein führen zu je einem eigenen
   Ausgang mit `target: "keine"`, der Beitritt zur Gruppenwahl und damit zum normalen Antrag.
3. Über Bewerbungen ohne Gruppe entscheidet der Bundesvorstand im Pool. `acceptAsAlumnus` wird zu
   `acceptWithoutGroup` mit angegebener Rolle; welche Rolle passt, entscheidet die App anhand des
   Nutzertyps, damit das Mitglieder-Modul keine Profiltabelle liest.

## Konsequenzen

- Der Pool zeigt zwei neue Arten: „Möchte eine Gruppe gründen" und „Bewirbt sich ohne Gruppe".
- Die Netzwerk-Gruppe bleibt der Weg für Förderer\*innen (ADR 0046), nicht mehr für Studierende.
- Wer später einer Gruppe beitritt, füllt die Hauptgruppe über den normalen Gruppenantrag.

# ADR 0046 — Förderer nimmt der Bundesvorstand auf

**Status:** Accepted
**Date:** 2026-09-16
**Affects:** `modules/members`, `apps/web`
**Überschreibt:** ADR 0045, Entscheidung 2 („Der Beitritt zu einer `netzwerk`-Gruppe ist selbstbedient")
**Spec:** [`docs/superpowers/specs/2026-09-16-nutzertypen-fundament-ii-design.md`](../superpowers/specs/2026-09-16-nutzertypen-fundament-ii-design.md)

## Kontext

ADR 0045 machte den Beitritt zur `netzwerk`-Gruppe selbstbedient: `changePrimaryGroup` setzte
den Account sofort auf `active`, ohne dass jemand entschied. Das war die erste Ausnahme von
ADR 0021/0031 und der erste Weg, auf dem sich ein Account selbst aufnimmt. Er musste deshalb
hinter einem Opt-in des Aufrufers (`allowNetzwerk`) und einer App-Prüfung verriegelt werden.

Die Föderation hat am 2026-09-16 anders entschieden: **Förderer und Interessierte nimmt der
Bundesvorstand auf.**

## Entscheidung

Der Beitritt zur `netzwerk`-Gruppe ist ein gewöhnlicher Antrag. Es gibt keine Ausnahme mehr von
ADR 0021/0031.

Dafür wird nichts gebaut. Eine `netzwerk`-Gruppe hat keinen Vorstand (`grantRole` verweigert
`local_board_lead` für jede Art außer `hochschulgruppe`), also greift der bestehende Rückfall aus
ADR 0021: über den Antrag entscheidet der Bundesvorstand. `decideGroupChange` setzt eine erste
Aufnahme wie bei jeder Bewerbung von `pending` auf `active`.

Entfernt werden der Sonderfall in `changePrimaryGroup` und dessen Opt-in `allowNetzwerk`.

## Konsequenzen

- **Kein Account nimmt sich selbst auf.** Die Reihenfolge-Pflicht aus ADR 0045 („erst alle
  Statusprüfungen umstellen, dann der Beitritt") ist gegenstandslos, ebenso die Sperre, die
  `netzwerk`-Zeile vor dem Beitritt in Produktion zu säen.
- **Förderer bleiben aufgenommen, aber keine Mitglieder.** ADR 0045 Entscheidung 1
  (`isBdasMember`) gilt unverändert.
- **Die Aufnahme verschickt die bestehende Mail „Bewerbung angenommen".** Der Beitritt ist jetzt
  eine echte Entscheidung und veröffentlicht das `decided`-Ereignis wie jede andere. Ein eigener
  Text für Förderer gehört in die Überarbeitung der Registrierung.
- **Die Gruppenauswahl im Profil bleibt auf Hochschulgruppen beschränkt**
  (`apps/web/lib/self-service-group.ts`). Einen Einstiegspunkt, über den sich jemand als Förderer
  bewirbt, gibt es bis zur Überarbeitung der Registrierung nicht.
- Ein Mitglied, das in die `netzwerk`-Gruppe wechseln will, stellt ebenfalls einen Antrag; seine
  gruppengebundenen Rechte verliert es erst mit der Entscheidung.

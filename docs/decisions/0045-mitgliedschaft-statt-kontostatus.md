# ADR 0045 — Mitgliedschaft statt Kontostatus

**Status:** Accepted — Entscheidung 2 überschrieben durch ADR 0046
**Date:** 2026-09-16
**Affects:** `modules/members`, `modules/groups`, später `modules/files`, `modules/events`, `apps/web`
**Spec:** [`docs/superpowers/specs/2026-09-16-nutzertypen-fundament-ii-design.md`](../superpowers/specs/2026-09-16-nutzertypen-fundament-ii-design.md)
**Ergänzt:** ADR 0007 (gescopte Grants), ADR 0021 (Beitritt entscheidet der lokale Vorstand), ADR 0031 (Bewerbung ist ein Gruppenantrag), ADR 0043 (Alumnus ist eine Rolle)

## Kontext

Bis hier galt: wer aufgenommen ist (`members.status = 'active'`), ist Mitglied. `effectiveGrants`
vergab den ungescopten `member`-Grant allein aus dem Status, und die Zugriffsprüfungen fragen bis
heute `status === "active"`.

Das stimmt nicht mehr, sobald die Plattform Accounts aufnimmt, die keine Mitglieder sind:
Förderer\*innen, Referent\*innen und Einzelpersonen bei Partnerorganisationen. Mit dem alten Grant
erbt jeder neue Nutzertyp im Moment der Aufnahme volle Mitgliedsrechte. Umgekehrt fehlte für
Ehemalige ohne Gruppe jeder Weg in die Plattform. Die Spec zählt acht Lücken auf; dieser ADR hält
die zwei Entscheidungen fest, die die übrigen tragen.

## Entscheidung

1. **Der ungescopte `member`-Grant folgt der Mitgliedschaft, nicht dem Kontostatus.** Mitglied ist,
   wer aufgenommen ist **und** entweder in einer Hochschulgruppe sitzt **oder** die
   Alumnus-Markierung trägt. Die Frage beantwortet genau eine Stelle:
   `isBdasMemberFrom(member, primaryGroupKind, grants)`, ausgewertet in `getCurrentMember` und dort
   als `CurrentMember.isBdasMember` abgelegt. `effectiveGrants` nimmt das Ergebnis als Parameter
   und liest den Status nicht mehr.
2. **Der Beitritt zu einer `netzwerk`-Gruppe ist selbstbedient.** Förderer-Accounts wohnen in einer
   gemeinsamen Gruppe der Art `netzwerk`. `changePrimaryGroup` wendet den Wechsel dorthin sofort
   an und setzt den Account auf `active`; niemand entscheidet darüber. Das ist die erste Ausnahme
   von ADR 0021/0031. Der Wechsel wird wie ein Austritt protokolliert, veröffentlicht aber kein
   `decided`-Ereignis, weil dessen Abonnent die Mail „Bewerbung angenommen" verschickt.

   **Reihenfolge ist Pflicht:** dieser Beitritt ist der erste Weg, auf dem sich ein Account selbst
   auf `active` setzt. Er landet deshalb erst, nachdem jede Prüfung auf `status === "active"`
   (Dateien, Blog, Event-Sichtbarkeit und -Anmeldung) auf `isBdasMember` bzw. „aufgenommener
   Account" umgestellt ist — sonst verschafft sich jede\*r Registrierte darüber Mitgliedszugang.

Dazu zwei Folgeregeln im selben Modul:

- **Die Alumnus-Markierung setzt die Aufnahme voraus.** `grantRole` verweigert `alumnus` für
  `pending`-Accounts. Wer nie aufgenommen wurde, war nie dabei (ADR 0043).
- **Der Bundesvorstand nimmt Ehemalige ohne Gruppe auf**, über `acceptAsAlumnus`: erst der Status,
  dann die ungescopte Markierung. Beide Schritte sind idempotent, ein abgebrochener Lauf wird durch
  einen zweiten Aufruf vervollständigt.

## Konsequenzen

- **Alumni bleiben Mitglieder**, auch ohne Gruppe und auch nach einem Wechsel ins Netzwerk: die
  Markierung überlebt jeden Gruppenwechsel.
- **Förderer sind aufgenommen, aber keine Mitglieder.** Sie bekommen keinen `member`-Grant und
  zählen nicht in `countMembersByStatus().active`. Sie behalten bewusst den Zugang zu
  `members_only`-Veranstaltungen. Diese Bedingung heißt „aufgenommener Account", nicht
  „Mitglied".
- **Aktive Accounts ohne Gruppe und ohne Markierung verlieren den `member`-Grant.** Das betrifft
  heute jede\*n, der oder die die eigene Gruppe verlassen hat. Gewollt: ohne Gruppe und ohne
  Nachweis ist niemand Mitglied.
- **Jede künftige interne Funktion sperrt Nicht-Mitglieder aus**, sobald sie den `member`-Grant
  oder `isBdasMember` prüft. Prüfungen auf `status === "active"` sind ab hier ein Fehler, außer an
  den Stellen, an denen die Spec ausdrücklich „aufgenommener Account" meint.
- **Die bestehenden Statusprüfungen** (Dateien, Blog, Event-Sichtbarkeit und -Anmeldung) zieht ein
  eigener PR nach, der selbstbediente Beitritt folgt erst danach. Bis beide gemergt sind, darf die
  `netzwerk`-Zeile nicht in Produktion gesät werden.
- **Wer vom Netzwerk in eine Hochschulgruppe wechselt, ist für deren Vorstand ein Bewerber**, kein
  bestehendes Mitglied — die Antragsliste muss das aus der Mitgliedschaft ableiten, nicht aus dem
  Status. Das gehört in den PR mit dem Beitritt.
- `members` erfährt die Gruppenart nur über `getGroupKind` und `listGroupIdsByKind` aus
  `@bdas/groups` (CLAUDE.md §1 Regel 1).

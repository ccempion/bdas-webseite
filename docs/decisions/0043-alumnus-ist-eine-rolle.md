# ADR 0043: Alumnus ist eine Rolle, kein Status — und `inactive` entfällt

**Status:** Accepted
**Date:** 2026-09-12
**Überschreibt:** Spec §4 (Rollen-Tabelle, Zeile „Alumni") und beantwortet eine offene Frage aus Spec §25

## Kontext

`alumnus` existiert in der Plattform doppelt: als `MemberStatus` und als
`Role`. `effectiveGrants` leitet aus dem Status einen ungescopten Grant ab,
und gleichzeitig ist derselbe Wert über `member_role_grants` regulär
vergebbar. Zwei Repräsentationen einer Tatsache, die auseinanderlaufen
können.

Der Status `inactive` ist daneben faktisch tot. Außerhalb von Tests
erscheint er nur noch in der `TRANSITIONS`-Map und im Typ selbst; kein
Code-Pfad schreibt ihn. Migration `0008_application_reasons.sql` (ADR 0031)
hat ihn aktiv geleert, indem sie abgelehnte Bewerber\*innen nach `pending`
zurücksetzte und die Ablehnung stattdessen in
`member_group_change_requests` protokollierte.

Die Föderation formuliert die Regel so: **wer schon einmal dabei war, ist
Alumnus.** Wer nicht mehr aktiv in einer Hochschulgruppe ist, gehört
trotzdem zum BDAS-Netzwerk. Ein Zustand „inaktives Mitglied" neben
„Alumnus" beschreibt damit keinen eigenen Sachverhalt.

## Entscheidung

### 1. `MemberStatus` wird `pending | active`

`alumnus` und `inactive` entfallen als Status. Der Status beschreibt ab
jetzt ausschließlich den Kontolebenszyklus — wartet auf Aufnahme, oder
aufgenommen. Alles Weitere ist Rolle.

`effectiveGrants` verliert den status-impliziten Alumnus-Zweig; die
`TRANSITIONS`-Map schrumpft auf die einzige verbleibende Kante
`pending → active`.

### 2. `alumnus` lebt nur noch als Grant

Die Rolle existiert bereits im `Role`-Union und in jedem
`member_role_grants_role_check`. Es wird also nichts gebaut, sondern die
Dublette gelöscht. Bestehende `alumnus`- und `inactive`-Zeilen werden per
Migration nach `status = 'active'` plus Grant-Zeile überführt; anschließend
bekommt `members.status` erstmals einen CHECK-Constraint (bisher wurden die
Werte ausschließlich in TypeScript validiert).

### 3. Vergeben darf der Lead der eigenen Gruppe oder der Bundesvorstand

`alumnus` bleibt **optional gescoped**. Damit regelt das bestehende
`canGrantLocalRoles` beide Fälle der Föderation, ohne neues Prädikat:

- **ohne Gruppe** (`group_id IS NULL`, etwa bei Auswahl direkt während der
  Registrierung) — nur der Bundesvorstand, weil `canManageGroup` für
  `groupId === null` ausschließlich `federal_board` passieren lässt;
- **mit Gruppe** — der Lead genau dieser Gruppe, oder der Bundesvorstand.
  Das deckt Studienende, Austritt und den Fall ab, dass ein\*e Ehemalige\*r
  sich bei der Registrierung fälschlich einer Gruppe anschließt und der
  Lead das korrigiert.

Die Codeänderung ist, `alumnus` in die bestehende delegate-role-Bedingung in
`requireCanGrant` aufzunehmen. `requireValidScope` bleibt unverändert.

Der Scope ist eine Herkunftsangabe, kein Recht: „Alumnus, ausgewiesen durch
HG Aachen" bleibt historisch korrekt, auch wenn die Person später die
Gruppe wechselt.

### 4. Die Rolle schränkt nichts ein

Alumni behalten `status = 'active'`, damit den `member`-Grant und damit
vollen Mitglieder-Zugriff einschließlich Event-Anmeldung. In der
Mitgliederliste ihrer Gruppe erscheinen sie gekennzeichnet.

Das beantwortet die offene Frage aus Spec §25 („Should alumni retain access
to event registration, or only to read-only views?") mit **ja** und weicht
damit bewusst von der Rollen-Tabelle in Spec §4 ab, die Alumni als
„Read-only access to network, opt-in newsletter, no event registration
unless re-flagged" führt. Diese Zeile ist ab hier überholt, ebenso die
Alumni-Zeile in Spec §8 („retains read-only network access"). Was §4
korrekt beschreibt, ist der Newsletter-Opt-in — der hängt nicht am
Alumnus-Grant und bleibt unverändert.

## Konsequenzen

- **Ablehnung und Alumnus bleiben strikt getrennt.** Ein\*e abgelehnte\*r
  Bewerber\*in bleibt `pending`; die Ablehnung liegt seit ADR 0031 im
  Antrag (`member_group_change_requests.status = 'rejected'`), nicht am
  Mitglied. Ohne diese Trennung hätte die Entscheidung, Alumni vollen
  Zugriff zu geben, jemandem Zugriff verschafft, der nie Mitglied war.
- **Der Austritt passt ohne Änderung.** `changePrimaryGroup` mit Ziel
  `null` setzt `primary_group_id = NULL`, entzieht die gruppengebundenen
  Grants und lässt `status = 'active'` stehen — „nicht mehr in einer
  Gruppe, trotzdem im Netzwerk". Es fehlt nur der Alumnus-Grant obendrauf.
- **Der Transfer-Pool ist die Regressionsstelle.** `pool.ts` schließt Alumni
  heute über den Status aus. Werden sie `active`, rutschen sie ohne
  Gegenmaßnahme zurück in den Pool; der Ausschluss muss über den Grant neu
  formuliert und getestet werden.
- **Die Mitgliederstatistik ändert sich sonst stillschweigend.** `stats.ts`
  führt heute einen eigenen `alumnus`-Eimer über den Status. Der Eimer
  bleibt, wird aber aus den Grants abgeleitet — sonst zählt der
  Bundesvorstand ab dem Merge andere Zahlen als vorher.
- **Es gibt keinen Ausschluss-Mechanismus mehr.** Mit `inactive` entfällt
  der letzte — ohnehin unverdrahtete — Weg, jemandem den Zugang zu
  entziehen, ohne den Account zu löschen. Am heutigen Verhalten ändert das
  nichts. Ein Ausschluss bei Fehlverhalten wäre ein eigenes Feature mit
  eigener Spec.
- **Ein Lead kann jedes Mitglied seiner Gruppe als Alumnus markieren.**
  Solange die Rolle eine reine Kennzeichnung ist, ist das harmlos. Sobald
  sie irgendwann etwas einschränkt, wird daraus eine
  Degradierungs-Befugnis — dann ist diese Entscheidung neu zu bewerten.
- Doppelte Alumnus-Grants (einer gescoped, einer nicht) sind durch den
  bestehenden Unique-Index `(member_id, role, COALESCE(group_id, ''))`
  möglich. Für die Kennzeichnung ist das folgenlos; ein zusätzlicher
  Constraint wird bewusst nicht eingeführt.

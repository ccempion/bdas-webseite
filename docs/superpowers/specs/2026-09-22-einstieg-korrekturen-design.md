# Einstieg: Korrekturen nach dem Textdurchgang (Design)

**Date:** 2026-09-22
**Status:** Approved (brainstorming)
**Baut auf:** [Onboarding-Wizard-Design vom 2026-09-16](2026-09-16-onboarding-wizard-design.md), ADR 0043 (Alumnus ist eine Rolle), ADR 0045 (Mitgliedschaft statt Kontostatus), ADR 0046 (Förderer nimmt der Bundesvorstand auf), ADR 0047 (BDAJ-Rechte), ADR 0048 (Antragsziel serverseitig), ADR 0049 (Client-Einstieg)
**Scope:** Korrekturen am fertigen Einstieg, entschieden nach einem Bilddurchgang durch alle 37 Bildschirme am 2026-09-21. Betrifft `modules/onboarding`, `modules/members`, `modules/profile`, `modules/auth` und `apps/web`. Kein neues Modul, kein neues Flag.

---

## 1. Ausgangslage

Der Einstieg steht und ist gemergt. Der Durchgang durch alle Bildschirme hat sieben Stellen
gezeigt, an denen der gebaute Weg nicht das tut, was er soll:

1. Wer in seiner Stadt keine Gruppe findet, liest „Du passt zu uns als Student\*in", wird aber als
   Förderer\*in gespeichert und der Netzwerk-Gruppe zugeschlagen. Anzeige und Datenbank sagen
   Verschiedenes.
2. Es gibt keinen Weg, eine Gruppengründung anzustoßen oder einer Gruppe in der Nähe beizutreten.
   Der einzige Ausgang ist der Netzwerk-Umweg.
3. „Du passt zu uns als X" beschreibt eine Rolle, die die Plattform gar nicht so genau vergibt. Der
   Satz klingt nach Zuteilung, nicht nach Anmeldung.
4. Der Bundesvorstand entscheidet laut Text „meist innerhalb von zwei Wochen". Tatsächlich braucht
   er höchstens zwei Tage.
5. Auf der Fertig-Seite steht „sobald Der Bundesvorstand entschieden hat": der Entscheider wird als
   Satzanfang formuliert und mitten in einen Satz gesetzt.
6. Der Bestätigungslink schluckt seine eigene Rückmeldung. Wer klickt, landet ohne ein Wort auf der
   Anmeldung, und darunter steht der Link auf die alte Registrierung.
7. Die Herkunftsfrage stellt dieselbe Frage zweimal (Überschrift und Feldbeschriftung) und sagt
   nicht, worauf es ankommt: dass eine Empfehlung zählt.

Dazu kommen zwei Wünsche aus dem Durchgang: „BDAJ-Funktionär\*innen" schließt zu viele aus, und der
Foto-Bildschirm soll aussehen wie ein Profilbild, nicht wie ein Datei-Upload.

## 2. Leitlinien

Die Leitlinien des Wizard-Designs gelten weiter. Für diesen Durchgang kommen drei dazu:

1. **Was angezeigt wird, steht auch so in der Datenbank.** Kein Nutzertyp, den die Person nie
   gelesen hat.
2. **Die Plattform meldet an, sie teilt nicht zu.** Der Ergebnisbildschirm beschreibt, wie der
   Zugang aussähe, und fragt, ob das passt.
3. **Keine langen Gedankenstriche.** In jedem Text, den ein Mensch liest, stehen Komma, Doppelpunkt
   oder Punkt.

## 3. Entscheidungen

| Nr. | Frage                            | Entscheidung                                                                                                |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| E1  | Studierende ohne Gruppe vor Ort  | Nutzertyp bleibt `student`, Hauptgruppe bleibt leer, Aufnahme über den Bundesvorstand im Pool               |
| E2  | Wunsch „nächstem BDAS beitreten" | Gruppenauswahl im Wizard, Antrag geht an den Vorstand dieser Gruppe, Hauptgruppe wird gesetzt               |
| E3  | BDAJ und BDAS gleichzeitig       | Nicht in diesem Durchgang. BDAJ bleibt Hauptgruppe; wer wechseln will, nutzt den vorhandenen Gruppenwechsel |
| E4  | Bestätigungslink                 | Meldet direkt an und führt auf „Deine Angaben". Gültigkeit und Einmaligkeit wie bisher                      |
| E5  | Bezeichnung der BDAJ-Leute       | „BDAJ-Mitglied", nicht „Funktionär\*in". Die Funktions-Auswahl im dritten Teil bleibt unverändert           |
| E6  | Herkunftsfrage                   | Variante B: fragt nach der Person, die einen gebracht hat, statt nach dem Kanal                             |
| E7  | Lange Gedankenstriche            | Plattformweiter Durchgang durch alle Texte, als eigener PR am Ende                                          |

## 4. Nutzertyp ohne Gruppe (E1)

### Heute

`FLOW.outcomes.student_ohne_gruppe` trägt `userType: "foerderer"` und `target: "netzwerk"`.
`completeJourney` ruft `changePrimaryGroup` mit der Netzwerk-Gruppe auf, der Bundesvorstand
entscheidet über den Antrag.

### Künftig

Der Ausgang zerfällt in zwei, beide mit `userType: "student"` und `target: "keine"`:

| Ausgang               | Wann                                        | Hauptgruppe  | Entscheidung                 |
| --------------------- | ------------------------------------------- | ------------ | ---------------------------- |
| `student_gruendung`   | Absicht „hier ein BDAS gründen"             | leer         | Bundesvorstand über den Pool |
| `student_ohne_gruppe` | Absicht „erst mal einfach dabei sein"       | leer         | Bundesvorstand über den Pool |
| `student`             | Gruppe vor Ort gefunden oder selbst gewählt | diese Gruppe | Vorstand dieser Gruppe       |

`target: "keine"` heißt: `completeJourney` legt keinen Gruppenantrag an, die Journey wird
abgeschickt, die Person steht im Pool des Bundesvorstands. Das ist derselbe Weg, den Alumni heute
schon gehen.

### Aufnahme ohne Gruppe verallgemeinern

`acceptAsAlumnus(db, memberId, actor)` in `modules/members/src/services/status.ts` setzt den Status
auf `active` und vergibt fest die Rolle `alumnus`. Für Studierende ohne Gruppe wäre das falsch.

Neu: `acceptWithoutGroup(db, memberId, actor, role: RoleName | null)`. Gleiche Prüfungen
(Bundesvorstand, Mitglied existiert, `primaryGroupId === null`), die Rolle kommt vom Aufrufer.
`acceptAsAlumnus` entfällt; die Pool-Seite liest den Nutzertyp aus `@bdas/profile` und übergibt
`"alumnus"` oder `null`. Das Mitglieder-Modul liest keine Profiltabelle, die Zuordnung liegt in der
App (Regel 1).

### Pool-Seite

`poolKindLabel` bekommt zwei Fälle:

| Lage                                | Text                                   |
| ----------------------------------- | -------------------------------------- |
| `outcome === "student_gruendung"`   | „Möchte eine Gruppe gründen"           |
| `outcome === "student_ohne_gruppe"` | „Bewirbt sich ohne Gruppe"             |
| `outcome === "alumnus"`             | „Bewirbt sich als Alumna oder Alumnus" |

Der Knopf heißt nicht mehr „Als Alumnus aufnehmen", sondern „Ohne Gruppe aufnehmen"; die
Rückfrage nennt den Namen wie bisher.

### Altbestand

Journeys mit `outcome = "student_ohne_gruppe"` und Nutzertyp Förderer können nur existieren, wenn
der Einstieg in der Produktion schon eingeschaltet war. Vor dem Merge von PR A wird der Stand von
`BDAS_FLAG_ONBOARDING` geprüft. Ist das Flag aus, gibt es keine Daten. Ist es an, bleiben bereits
abgeschickte Bewerbungen wie sie sind (sie hängen an einem echten Gruppenantrag); nur offene
Journeys rechnen beim nächsten Aufruf neu, wie es `nextStep` ohnehin tut.

## 5. Flow: Abzweigung nach dem Studienort (E2)

```
studienort
  |
  +-- Gruppe in der Stadt gefunden ------------------> Ausgang: student
  |
  +-- keine Gruppe
        |
        v
      absicht  (Auswahl, drei Karten)
        |
        +-- "gruendung"  -------------------------> Ausgang: student_gruendung
        +-- "dabei"      -------------------------> Ausgang: student_ohne_gruppe
        +-- "beitreten"  --> gruppenwahl ---------> Ausgang: student
```

Zwei neue Fragen in `modules/onboarding/src/flow.ts`:

- `absicht`, Art `choice`, nur erreichbar, wenn `studienort` keine Gruppe ergeben hat.
- `gruppenwahl`, neue Art `group_near`. Der Bildschirm listet aktive Hochschulgruppen, die
  nächstgelegene zuerst.

Regeln (Ergänzung zu den bestehenden):

```
studienort  when has_group(studienort)          -> outcome student
studienort                                       -> question absicht
absicht     when equals(absicht, "beitreten")    -> question gruppenwahl
absicht     when equals(absicht, "gruendung")    -> outcome student_gruendung
absicht                                          -> outcome student_ohne_gruppe
gruppenwahl                                      -> outcome student
```

`FLOW.version` steigt auf 2. Gespeicherte Antworten auf verschwundene Fragen verwirft `nextStep`
still, das ist bereits so gebaut.

### Reihenfolge der Liste

Eine echte Entfernung ist nicht zu haben: Koordinaten trägt nur die Gruppe (`location_lat`,
`location_lng`), die Hochschulliste in `@bdas/profile` verbindet Hochschule und Stadt, kennt aber
keine Koordinaten. Für die getippte Stadt gibt es also keinen Bezugspunkt, und ein Geocoder kommt
für diesen Weg nicht in Frage.

Deshalb: die Liste zeigt alle aktiven Hochschulgruppen mit ihrer Stadt, alphabetisch nach Stadt, mit
einem Suchfeld wie bei den anderen langen Listen. Bei der heutigen Zahl von Gruppen ist das keine
Einschränkung.

Wenn später wirklich nach Entfernung sortiert werden soll, braucht es eine einmalige
Koordinatentabelle für die Hochschulstädte. Das ist eine eigene Datendatei und ein eigener PR, nicht
Teil dieses Durchgangs.

### Antragsziel

`placeOf` liefert heute den Ort aus der Antwort auf `studienort` oder `aktiv_wo`. Neu gilt: eine
Antwort der Art `group` schlägt eine Antwort der Art `city`. Damit wird die in `gruppenwahl`
gewählte Gruppe das Antragsziel, obwohl `studienort` eine Stadt ohne Gruppe enthält. Die einzige
Gruppen-Kennung, die aus dem Browser kommt, bleibt eine, die in `env.groups` steht (ADR 0048).

## 6. Texte

Alle Texte dieses Abschnitts sind die künftigen Endfassungen. Platzhalter in geschweiften Klammern
setzt `fillText` ein.

### 6.1 Typ-Frage

| Stelle              | Neu                            |
| ------------------- | ------------------------------ |
| Karte BDAJ, Hinweis | „Für alle Mitglieder der BDAJ" |

Alles andere bleibt.

### 6.2 Studienort ohne Treffer

> In {eingabe} finden wir keine Gruppe. Kein Problem, gleich fragen wir dich, wie es weitergehen
> soll.

### 6.3 Absicht

> **In {stadt} gibt es noch kein BDAS. Was möchtest du?**
> Beides geht: mit uns etwas aufbauen oder erst mal nur dabei sein.

| Karte | Titel                                | Hinweis                             |
| ----- | ------------------------------------ | ----------------------------------- |
| a     | „Ein BDAS in {stadt} gründen"        | „Wir helfen dir beim Aufbau"        |
| b     | „Erst mal einfach dabei sein"        | „Ohne Gruppe vor Ort"               |
| c     | „Dem nächstgelegenen BDAS beitreten" | „Auch wenn es etwas weiter weg ist" |

### 6.4 Gruppenwahl

> **Welchem BDAS möchtest du beitreten?**
> Such dir eine Gruppe aus. Über deine Bewerbung entscheidet dann der Vorstand dieser Gruppe.

Eintrag: Name der Gruppe, darunter die Stadt. Suchfeld über der Liste. Zurück führt auf die
Absicht.

### 6.5 Ergebnis

Die Überschrift beschreibt den Zugang, darunter stehen wie bisher Vorteile und Entscheider, darüber
der Knopf die Frage.

| Ausgang               | Überschrift                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `student`             | „Du wärst als Student\*in in {stadt} auf der Plattform angemeldet."                         |
| `student_gruendung`   | „Du wärst als Student\*in in {stadt} angemeldet, mit uns an deiner Seite für die Gründung." |
| `student_ohne_gruppe` | „Du wärst als Student\*in in {stadt} angemeldet, auch ohne Gruppe vor Ort."                 |
| `alumnus`             | „Du wärst als Alumna oder Alumnus angemeldet."                                              |
| `foerderer`           | „Du wärst als Förderer\*in angemeldet."                                                     |
| `bdaj`                | „Du wärst als BDAJ-Mitglied angemeldet."                                                    |

Vorteile für `student_gruendung`:

- „Unterstützung, wenn du in {stadt} eine Gruppe gründen willst"
- „Bundesweites Netzwerk alevitischer Studierender"
- „Einladungen zu überregionalen Events"

Vorteile für `student_ohne_gruppe`: wie heute, ohne die Gründungszeile.

Unter dem Entscheider-Kasten:

> Passt das so?
> \[ Passt so, Konto anlegen ] \[ Etwas ändern ]

### 6.6 Dauer und Entscheider

- Bundesvorstand: „meist innerhalb von zwei Tagen" (bisher zwei Wochen).
- Vorstand einer Gruppe: „meist innerhalb weniger Tage", unverändert.

Auf der Fertig-Seite wird der Satz so gebaut, dass der Entscheider nicht mehr im Satzinneren steht:

> Wir melden uns per Mail, sobald die Entscheidung da ist, {dauer}.

Die Schrittliste („Beworben", „{Entscheider} prüft", „Aufgenommen") bleibt, dort steht der
Entscheider am Zeilenanfang und ist richtig großgeschrieben.

### 6.7 Herkunft (E6)

> **Wer hat dich zu uns gebracht?**
> Die meisten kommen über jemanden, den sie kennen. Nenn uns diese Person, dann weiß der Vorstand
> gleich, wo du herkommst.

| Feld                  | Text                                                               |
| --------------------- | ------------------------------------------------------------------ |
| Auswahl               | „Wie bist du zu uns gekommen?" mit Webseite, Instagram, Empfehlung |
| Zusatz bei Empfehlung | „Wer hat dich empfohlen?"                                          |
| Freitext              | „Magst du kurz erzählen, warum du dabei sein willst? (optional)"   |

Überschrift und Feldbeschriftung sind damit nicht mehr dieselbe Frage.

### 6.8 Foto

> **Magst du ein Foto hochladen?**
> Freiwillig. So erkennt dich dein Vorstand beim ersten Treffen.

## 7. Bestätigungslink meldet an (E4)

`verifyEmail` gibt heute `{ userId, email, alreadyVerified }` zurück und ist einmalig
(`usedAt`) und befristet (`expiresAt`). Die Seite `/verifizieren/[token]` legt künftig bei einer
frischen Bestätigung die Sitzung an, mit derselben Funktion, die die Anmeldung benutzt, und leitet
auf das Ziel aus `resolveOnboardingLanding` weiter, in der Regel `/mitmachen/angaben`.

- Ein bereits benutzter oder abgelaufener Link legt keine Sitzung an und zeigt die heutige Seite mit
  klarer Meldung und einem Knopf zur Anmeldung.
- Das Weiterleitungsziel wird serverseitig bestimmt, nichts davon kommt aus der URL.
- Gültigkeit und Rate-Limits bleiben unverändert.

Damit verschwindet auch der irreführende Fußzeilen-Link „Noch kein Konto? Registrieren" aus dem
Weg: wer über den Link kommt, sieht die Anmeldeseite gar nicht mehr.

## 8. Foto als Profilbild

`PhotoField` nutzt bereits `DropZone` und den Zuschnitt-Dialog. Neu ist nur die Darstellung:

- Ein runder Platzhalter von 128 px mit Kamerasymbol, Beschriftung darunter.
- Klick öffnet die Dateiauswahl, Ablegen per Drag-and-Drop funktioniert wie bisher, danach der
  vorhandene Zuschnitt-Dialog.
- Nach dem Zuschnitt steht das Bild im Kreis, daneben „Foto ändern" und „Entfernen".
- Tastaturbedienbar, sichtbarer Fokusring, Werte aus den Design-Tokens.

## 9. Lange Gedankenstriche (E7)

Ein eigener Durchgang über alle Texte, die ein Mensch sieht: Oberflächen in `apps/web`, Texte in den
Modulen, Mail-Vorlagen, Seed-Inhalte. Ersetzt wird je nach Satz durch Komma, Doppelpunkt oder Punkt.
Code-Kommentare und Dokumente bleiben unangetastet.

Absicherung gegen Rückfall: ein Test in `modules/onboarding`, der die Texte des Flows auf lange
Gedankenstriche prüft. Ein plattformweiter Linter wäre zu grob, weil Kommentare und Dokumente
mitgezählt würden.

## 10. Tests

| Ebene | Was                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------- |
| Modul | Flow-Regeln der neuen Abzweigung, `placeOf` bevorzugt die Gruppe, Entfernungssortierung, `validate-flow`       |
| Modul | `acceptWithoutGroup` mit und ohne Rolle, Ablehnung bei gesetzter Hauptgruppe                                   |
| App   | `poolKindLabel` für die neuen Ausgänge, Interaktionstests für Absicht und Gruppenwahl                          |
| E2E   | Studentin ohne Gruppe, Absicht Gründung, landet im Pool; Studentin wählt Gruppe in der Nähe, Antrag liegt dort |
| E2E   | Bestätigungslink meldet an und landet auf „Deine Angaben"                                                      |

Die E2E-Läufe gehören in die bestehende `onboarding`-Projektgruppe auf Port 3001.

## 11. Schnitt

| PR  | Inhalt                                                                                    | ADR  |
| --- | ----------------------------------------------------------------------------------------- | ---- |
| A   | Flow, Absicht, Gruppenwahl, Ausgänge, `acceptWithoutGroup`, Pool-Seite, Tests             | 0050 |
| B   | Texte: Ergebnis, Dauer, Fertig-Seite, Herkunft, BDAJ-Wording, Gedankenstriche im Einstieg | 0052 |
| C   | Bestätigungslink meldet an                                                                | 0051 |
| D   | Foto als runder Profilbild-Platzhalter                                                    | kein |
| E   | Gedankenstrich-Durchgang über die übrige Plattform                                        | kein |

ADRs:

- **0050** Studierende ohne Gruppe behalten ihren Nutzertyp. Korrigiert den Förderer-Umweg aus dem
  Wizard-Design und hält fest, dass eine leere Hauptgruppe der Normalfall für diesen Weg ist.
- **0051** Der Bestätigungslink legt die Sitzung an. Hält fest, warum das vertretbar ist:
  einmalig, befristet, Ziel serverseitig.
- **0052** BDAJ-Mitglieder statt Funktionär\*innen. Korrigiert die Sprache aus ADR 0047; der
  Rechte-Zuschnitt dort bleibt gültig.

## 12. Offene Punkte

1. Stand von `BDAS_FLAG_ONBOARDING` in der Produktion vor dem Merge von PR A prüfen (Abschnitt 4).
2. Die Gruppenliste ist alphabetisch, nicht nach Entfernung sortiert (Abschnitt 5). Eine Sortierung
   nach Entfernung bräuchte eine Koordinatentabelle für die Hochschulstädte und wäre ein eigener PR.

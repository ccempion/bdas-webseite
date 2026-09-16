# Onboarding-Wizard: Registrierung nach Nutzertyp — Design

**Date:** 2026-09-16
**Status:** Approved (brainstorming)
**Baut auf:** ADR 0031 (Bewerbung ist ein Gruppenantrag), ADR 0021 (Rückfall an den Bundesvorstand), ADR 0043 (Alumnus ist eine Rolle), ADR 0044 (profillose Bewerber\*innen), ADR 0045 (Mitgliedschaft statt Kontostatus), ADR 0046 (Förderer nimmt der Bundesvorstand auf), Alumni-Produktentscheidungen vom 2026-09-15
**Scope:** Ersetzt die Seite `/registrieren` und den Profil-Wizard unter `/profil` durch einen geführten Einstieg: erst ein paar Fragen, daraus ein Nutzertyp, dann Konto, dann die zum Typ passenden Angaben, am Ende ist die richtige Bewerbung offen. Die Registrierung öffnet sich als wegklickbares Fenster über der aktuellen Seite. Neues Modul `modules/onboarding`; betrifft außerdem `profile`, `notifications` und `apps/web`.

---

## 1. Ausgangslage

Heute ist die Registrierung eine eigene Seite (Vorname, Nachname, E-Mail, Passwort). Nach der
Bestätigung der E-Mail führt `/profil` durch einen Formular-Wizard mit sechs Schritten, der immer
eine Hochschulgruppe verlangt. Die Plattform kennt inzwischen aber vier Wege hinein, von denen der
Formular-Wizard nur einen abbildet:

| Nutzertyp | Aufnahme | Stand |
|---|---|---|
| Student\*in | Antrag an die Hochschulgruppe, deren Vorstand entscheidet (ADR 0031) | gebaut |
| Alumnus/Alumna | Aufnahme ohne Gruppe durch den Bundesvorstand (`acceptAsAlumnus`) | Mechanik gebaut, kein Einstieg |
| Förderer/Interessierte | Antrag an die `netzwerk`-Gruppe, Bundesvorstand entscheidet (ADR 0046) | Mechanik gebaut, kein Einstieg (`self-service-group.ts` verweist ausdrücklich auf diesen Wizard) |
| BDAJ-Funktionär\*in | Antrag an die `affiliate`-Gruppe BDAJ, Bundesvorstand entscheidet (ADR 0021-Rückfall) | Gruppenart gebaut, BDAJ-Zeile entsteht parallel |

Wer sich heute registriert, muss unsere Struktur schon verstehen, um richtig anzukommen. Das soll
der Wizard übernehmen.

## 2. Leitlinien

Diese Sätze entscheiden, wenn eine Detailfrage offen ist:

1. **Frag nach der Person, nicht nach unserer Struktur.** „Was beschreibt dich am besten?" statt
   „Wähle eine Mitgliedsart".
2. **Erst Nutzen, dann Aufwand.** Fragen und Ergebnis kommen vor Passwort und Postfach.
3. **Eine Entscheidung pro Bildschirm.** Jeder Bildschirm muss sich seinen Platz verdienen.
   Fortschritt heißt „fast fertig", nicht „Schritt 4 von 9".
4. **Jedes Feld sagt in einem Satz, warum wir fragen.**
5. **Immer ein Ausweg und ein Zurück.** Das Fenster lässt sich schließen, der Weg später
   fortsetzen, Zurück verliert nie Antworten.
6. **Ehrliches Ergebnis.** Wer entscheidet, was als Nächstes passiert und wie lange es ungefähr
   dauert, steht auf dem Ergebnisbildschirm.
7. **Das System spricht, ohne Chat und ohne KI.** Alle Texte sind vorgeschrieben. „Sprechen" heißt:
   Texte greifen frühere Antworten auf („Super, Lea — …"), Antworten sind antippbare Karten, jede
   Auswahl gibt sofort sichtbares Feedback. Kein Sprachmodell, keine Chat-Optik (entschieden
   2026-09-16).

## 3. Entscheidungen

- **Fragen zuerst, Konto danach.** Die Triage läuft ohne Konto; das Konto wird erst angelegt, wenn
  die Person ihr Ergebnis gesehen hat.
- **Alle vier Nutzertypen ab Start.** BDAJ erscheint nur, wenn eine `affiliate`-Gruppe BDAJ
  existiert (§5.4); der Wizard legt sie nicht an.
- **Student\*in ohne Gruppe in der Stadt → Interessierte.** Antrag an `netzwerk`, die Stadt reist
  mit, dazu der Hinweis „Du willst in Passau eine Gruppe gründen? Wir helfen dir." Der
  Bundesvorstand sieht so, wo Nachfrage entsteht. Keine Vorschläge für Nachbarstädte.
- **Der Ablauf ist Konfiguration (Ansatz A).** Fragen, Verzweigungen und Ergebnisse stehen in einer
  typisierten Datei; ein generischer Renderer zeigt sie an; eine reine Funktion entscheidet, was als
  Nächstes kommt. Eine neue Frage oder ein neuer Typ ist ein PR an einer Datei.
- **Nudges sind Einstiegspunkte mit Einstiegskontext.** Geplant sind: nach einer
  Event-Gastanmeldung, Teaser für Mitglieder-Inhalte, Newsletter-Abonnent\*innen,
  QR-Codes/Kampagnenlinks. Keiner davon ändert den Wizard.

Verworfen:

- **Ablauf in der Datenbank mit Editor für den Bundesvorstand (Ansatz B).** Braucht Editor,
  Versionierung und den Umgang mit halb durchlaufenen alten Versionen. Weil die Konfiguration aus
  Ansatz A reine Daten ist, lässt sich B später ohne Umbau darauf setzen.
- **Handgebaute Bildschirme je Schritt (Ansatz C, heutiger `Wizard.tsx`).** Jede Änderung berührt
  mehrere Dateien.
- **KI-Assistent oder Chat-Oberfläche.** Vom User abgelehnt.
- **Konto zuerst.** Der unattraktivste Schritt käme vor jedem Nutzen.

## 4. Was die Person sieht

Alles läuft in einem Fenster über der aktuellen Seite. Auf dem Handy wird es ein Sheet in voller
Höhe.

### 4.1 Teil 1 — Triage (ohne Konto, ca. 30 s)

1. **Willkommen.** Text abhängig vom Einstiegskontext („Schön, dass du da bist!" bzw. „Du warst
   beim Sommerfest in Köln — willkommen!"). Knopf *Los geht's*, Link *Ich habe schon ein Konto*.
2. **„Was beschreibt dich am besten?"** Vier große Karten mit Icon und einer Zeile; ein Tippen geht
   direkt weiter:
   - *Ich studiere gerade*
   - *Ich habe studiert*
   - *Ich bin in der BDAJ aktiv* (nur wenn die BDAJ-Gruppe existiert)
   - *Ich möchte BDAS unterstützen / bin einfach neugierig*
3. **„Wie dürfen wir dich nennen?"** Vor- und Nachname. Ab hier sprechen die Texte die Person mit
   Vornamen an. (Der Name steht hier und nicht in Teil 3, weil `members.first_name` NOT NULL ist
   und ADR 0044 die Member-Zeile bei der Registrierung voraussetzt.)
4. **Folgefrage je Karte:**
   - *studiere gerade* → „Wo studierst du?": Suche nach Stadt oder Hochschule, Treffer zeigen
     Gruppen live („✓ BDAS Berlin"). Ohne Gruppe: „In Passau gibt es noch keine Gruppe —
     vielleicht gründest du sie?"
   - *habe studiert* → „Wo warst du aktiv?": Gruppe **oder** Stadt, *Überspringen* möglich.
   - BDAJ und Unterstützer\*innen: keine Folgefrage.
5. **Ergebnis.** „Du passt zu uns als **Studentin in Berlin**." Darunter: was man bekommt, wer
   entscheidet („Der Vorstand von BDAS Berlin"), wie lange es ungefähr dauert. Knöpfe
   *Passt — Konto anlegen* und *Doch etwas anderes*.

### 4.2 Teil 2 — Konto (ca. 20 s)

6. **E-Mail, Passwort, Einwilligung** im selben Fenster; eine E-Mail aus dem Einstiegskontext ist
   vorausgefüllt. Danach: „Wir haben dir eine Mail geschickt", Knopf *Erneut senden*. Das Fenster
   darf jetzt geschlossen werden.

### 4.3 Teil 3 — Angaben (nach der Bestätigung)

7. Der Bestätigungslink öffnet den Wizard an dieser Stelle, auf jedem Gerät. „Willkommen zurück,
   Lea — fast geschafft." Dann nur die Felder des Typs, weiterhin ein Thema pro Bildschirm:

| Typ | Felder |
|---|---|
| Student\*in | Studienfach (Kategorie → Fach) + Abschlussart → Hochschule → Geburtsdatum → Wie hast du uns gefunden? → Foto (optional) |
| Alumnus/Alumna | Studienfach (Kategorie → Fach) → ehemalige Hochschule → Wie hast du uns gefunden? |
| Förderer/Interessierte (inkl. Student\*in ohne Gruppe) | „Was interessiert dich an BDAS?" (Kurztext) → Wie hast du uns gefunden? |
| BDAJ | „Welche Funktion hast du in der BDAJ?" (eine Karte: *Vorstandsmitglied*, *Mitglied*, *Geschäftsstelle*) → Wie hast du uns gefunden? |

   Das Studienfach ist zweistufig, die Kategorie wird mitgespeichert (Entscheidung 2026-09-16).
   Quelle ist `modules/profile/data/studienfaecher.csv` (11 Kategorien, 265 Fächer) — **liegt noch
   nicht auf main**, sondern auf `docs/studienfach-liste`; der Teil-3-PR setzt sie voraus.

8. **Zusammenfassung** mit *Ändern* je Block → *Bewerbung abschicken*.
9. **Fertig.** „Deine Bewerbung liegt jetzt bei …, wir melden uns per Mail." Nächste Schritte als
   kleine Zeitleiste, darunter ein Nudge-Platz (z. B. „Schau dir die nächsten Events an").

### 4.4 Überall

- Schmale Fortschrittsleiste, die pro Teil füllt, nicht pro Frage.
- Zurück verliert nichts; Schließen verliert den Weg nicht.
- Jedes Feld hat eine Zeile „Warum fragen wir das?".
- Tastatur und Screenreader: Fokus bleibt im Fenster, Esc schließt, alles ohne Maus bedienbar.
- Gestaltung nur über `core/design-system`-Tokens: Markenrot ausschließlich für die gewählte Karte
  und den Hauptknopf, Karten heben sich beim Hover (−2px, ~300ms), Radien 6/12/20px.

## 5. Architektur

### 5.1 Modul `modules/onboarding`

Eigenes Modul, eigenes Flag `onboarding` (in Produktion aus bis zur Abnahme), eigene Migrationen
in `modules/onboarding/migrations/`, eingetragen in `infra/migrations/manifest.ts`. Öffentliche
Oberfläche nur `index.ts`.

Bestandteile:

- **`flow.ts` — die Konfiguration.** Reine Daten, JSON-serialisierbar, mit `version`:

  ```ts
  type Flow = {
    version: number;
    start: QuestionId;
    questions: Record<QuestionId, Question>;   // Text, Hilfezeile, Antworttyp, Optionen
    rules: Rule[];                             // wenn Antworten X → nächste Frage oder Ergebnis
    outcomes: Record<OutcomeId, Outcome>;      // Typ, Detailfelder, Antragsziel, Texte
  };
  type OutcomeId = "student" | "student_ohne_gruppe" | "alumnus" | "foerderer" | "bdaj";
  ```

  Texte dürfen Platzhalter aus früheren Antworten enthalten (`{vorname}`, `{stadt}`,
  `{gruppe}`).

- **`nextStep(flow, answers, entry, env)` — die Entscheidung.** Reine Funktion ohne DB-Zugriff.
  Liefert die nächste offene Frage oder das Ergebnis. `env` enthält, was sich zur Laufzeit ändert
  (gibt es eine BDAJ-Gruppe, welche Gruppen gibt es in der Stadt). Läuft im Browser für sofortige
  Reaktion und auf dem Server als maßgebliche Prüfung.

- **Konfigurationsprüfung `validateFlow(flow)`.** Schlägt fehl, wenn eine Regel ins Leere zeigt,
  ein Ergebnis fehlt, eine Frage unerreichbar ist oder ein Platzhalter vor seiner Frage benutzt
  wird. Läuft als Test.

- **Einstiegskontext `EntryContext`.** `{ source: string; prefill?: Partial<Answers>; greeting?:
  string }`, gelesen aus einer Whitelist bekannter Quellen (`event:<id>`, `newsletter`,
  `kampagne:<slug>`, `inhalt:<id>`). Unbekannte Quellen werden zu `direkt`. `prefill` füllt nur
  vor, beantwortet nie eine Frage verbindlich.

- **Tabelle `onboarding_journeys`.** Eine Zeile pro Konto:
  `id`, `user_id` (unique, `ON DELETE CASCADE`), `flow_version`, `answers` (jsonb),
  `entry_source`, `outcome`, `stadt` (für „Gruppe gründen"-Nachfrage), `status`
  (`details_offen | abgeschickt`), `application_ref` (Antrags-ID aus members, nullable),
  `created_at`, `updated_at`.

- **Dienste:** `startJourney`, `getJourneyForUser`, `saveDetails`, `completeJourney`,
  `getApplicationIntent(memberId)` (für die Anzeige „bewirbt sich als Alumnus").

- **Ereignis `onboarding.completed`** `{ memberId, outcome, entrySource, at }` über `core/events`.

### 5.2 Ergebnis → Antrag

`completeJourney` öffnet den Antrag ausschließlich über die öffentliche Schnittstelle von
`@bdas/members`:

| Ergebnis | Aufruf | Entscheidet |
|---|---|---|
| `student` | `changePrimaryGroup(memberId, gruppeAusAntworten)` | Vorstand der Gruppe |
| `student_ohne_gruppe`, `foerderer` | `changePrimaryGroup(memberId, netzwerkGruppe)` | Bundesvorstand |
| `bdaj` | `changePrimaryGroup(memberId, bdajGruppe)` | Bundesvorstand |
| `alumnus` | kein Gruppenantrag; Member bleibt `pending` ohne Gruppe, Absicht steht in der Journey | Bundesvorstand über „Ohne Gruppe" (`acceptAsAlumnus`) |

`changePrimaryGroup` verbietet heute über den App-Guard `requireSelfServiceGroup` Anträge an
`netzwerk`/`affiliate`. Der Wizard ruft den Dienst ohne diesen Guard auf; die Autorisierung
übernimmt stattdessen der Wizard selbst: **das Ziel wird ausschließlich aus dem serverseitig
berechneten Ergebnis abgeleitet**, nie aus einer vom Browser gesendeten Gruppen-ID. Das ist die
Lehre aus dem Events-Befund (Ziel-Zustand autorisieren, nicht nur den Ausgangszustand).

„Ohne Gruppe" im Bundesvorstand zeigt „bewirbt sich als Alumnus/Alumna" über
`getApplicationIntent`. Die Seite liest dabei nie die Tabelle von onboarding.

### 5.3 Datenfluss

1. **Teil 1 im Browser.** Antworten liegen im Fensterzustand und in `sessionStorage` (überlebt
   Neuladen). Nichts geht an den Server, bevor die Person eingewilligt hat. Die Gruppensuche liest
   nur die ohnehin öffentliche Gruppenliste.
2. **Konto anlegen — eine Server-Aktion.** Empfängt E-Mail, Passwort, Einwilligung, Name, Antworten,
   Einstiegskontext. Sie rechnet `nextStep` selbst nach und verwirft ein vom Browser mitgeschicktes
   Ergebnis. Reihenfolge: `register` (auth) → `createProfile` (members) → `startJourney`
   (onboarding). Scheitert `startJourney`, wird geloggt und der Weg beim ersten Login aus den
   gespeicherten Antworten neu begonnen (Teil 1 ab Frage 2) — wie heute bei `createProfile`.
3. **Bestätigung.** Der bestehende Link aus `/verifizieren` leitet bei vorhandener Journey mit
   `status = details_offen` in Teil 3.
4. **Abschicken.** Server lädt die Journey, rechnet das Ergebnis mit aktuellem `env` nach, speichert
   die Angaben (profile), öffnet den Antrag (members), setzt `status = abgeschickt` und
   `application_ref`, veröffentlicht `onboarding.completed`. Ist bereits ein Antrag offen, wird er
   wiederverwendet — doppeltes Abschicken erzeugt keinen zweiten.

**Konfigurationsänderung mitten im Weg:** Die Journey kennt ihre `flow_version`. `nextStep` läuft
über die gespeicherten Antworten, verwirft solche zu nicht mehr existierenden Fragen und fragt nur,
was fehlt.

### 5.4 BDAJ

Die BDAJ-Gruppe wird parallel gebaut. Der Wizard sucht zur Laufzeit die `affiliate`-Gruppe BDAJ
(über `@bdas/groups`). Gibt es sie nicht, fehlt die BDAJ-Karte, und eine Journey mit Ergebnis
`bdaj` bleibt bei `details_offen` mit dem Hinweis „Wir melden uns, sobald es losgeht". Beide
Arbeiten können in beliebiger Reihenfolge gemergt werden. Die individuell zuschaltbaren Rechte aus
der BDAJ-Spec (2026-09-07) sind nicht Teil dieses Designs.

### 5.5 Registrierungsfenster

`/registrieren` wird mit Next.js-Intercepting-Routes als Fenster über der aktuellen Seite
geöffnet, wenn man innerhalb der Seite dorthin navigiert, und als normale Seite gerendert, wenn
jemand die Adresse direkt aufruft (geteilter Link, QR-Code, Bestätigungsmail). Beide Fälle rendern
dieselbe Komponente. Der Einstiegskontext kommt als Query-Parameter `?from=…`.

Eingeloggte Personen sehen statt „Mitmachen" ihren Stand („Deine Bewerbung liegt bei …").

### 5.6 Anpassungen außerhalb von onboarding

- **`profile`:** `SaveProfileFields` verlangt heute alle Studierenden-Felder. Nötig sind
  Feldsätze je Nutzertyp (siehe §4.3) plus die gespeicherte Studienfach-Kategorie. Eigener PR im
  Modul profile.
- **`notifications`:** ADR 0046 hält fest, dass Förderer heute die Mail „Bewerbung angenommen"
  erhalten und ein eigener Text in diese Überarbeitung gehört. Die Mail wählt ihren Text nach dem
  Ergebnis aus `getApplicationIntent`/dem Ereignis. Eigener PR.
- **Entfernt:** `apps/web/app/profil/Wizard.tsx`, die Schrittliste `apps/web/app/_profile/steps.ts`
  und die Namensfelder in `RegistrierenForm.tsx`. Das Profilbearbeiten unter `/account` bleibt.

## 6. Fehlerfälle

| Fall | Verhalten |
|---|---|
| E-Mail schon registriert | wie heute in `register` |
| Fenster vor dem Konto geschlossen | Antworten bleiben in diesem Tab; auf dem Server liegt nichts |
| E-Mail nie bestätigt | bestehende Aufräumlogik (ADR 0044) löscht das Konto, die Journey fällt per Cascade mit |
| Bestätigung auf anderem Gerät | Journey liegt auf dem Server, Teil 3 öffnet sich dort |
| Gewählte Gruppe inzwischen gelöscht oder inaktiv | Ergebnis wird `student_ohne_gruppe`, kurzer Hinweis auf dem Zusammenfassungsbildschirm |
| BDAJ-Gruppe existiert nicht | §5.4 |
| Vom Browser gesendetes Ergebnis oder Gruppen-ID | wird ignoriert, Server rechnet nach |
| Bots | kein neuer öffentlicher Schreibweg vor dem Konto; bestehende Rate-Limits in `register` |
| Bereits eingeloggt | Einstiegspunkte zeigen den Stand statt „Mitmachen" |
| Bestehende Konten ohne Bewerbung (alter Wizard) | Beim Login ohne Journey und ohne offenen Antrag startet der Wizard nach der Namensfrage |

## 7. Tests

- **Unit:** Tabelle aller Wege (Antworten → Ergebnis), `validateFlow` gegen die echte
  Konfiguration und gegen kaputte Beispiele, Vorausfüllen aus dem Einstiegskontext, unbekannte
  Quellen → `direkt`, Fortsetzen nach Versionswechsel, Platzhalter.
- **Integration (Docker-Postgres, keine DB-Mocks):** Journey speichern/fortsetzen; jedes Ergebnis
  öffnet genau den richtigen Antrag; doppeltes Abschicken; gelöschte Gruppe → ohne Gruppe;
  Kontolöschung entfernt die Journey; `getApplicationIntent`.
- **Sicherheit:** manipuliertes Ergebnis und fremde Gruppen-ID werden ignoriert; keine BDAJ-Karte
  und kein BDAJ-Antrag ohne BDAJ-Gruppe; Teil 3 nur für den eigenen Account.
- **E2E (Playwright):** Fenster öffnet aus dem Header, schließt, funktioniert als volle Seite per
  Direktlink; je ein vollständiger Weg Student\*in, Alumnus, Förderer; Bestätigung in frischem
  Browserkontext setzt fort.
- **Barrierefreiheit:** Fokusfalle, Esc, reine Tastaturbedienung.
- Es laufen nur die Tests der jeweils betroffenen Dateien.

## 8. PR-Schnitt

1. **`modules/onboarding` — Fundament.** Konfiguration, `nextStep`, `validateFlow`,
   `EntryContext`, Tabelle + Migration + Manifest-Eintrag, Dienste, Ereignis, README, Flag.
   Keine Oberfläche.
2. **`profile` — Feldsätze je Nutzertyp** plus Studienfach-Kategorie (setzt die CSV auf main
   voraus).
3. **Web — Fenster, Teil 1 und 2.** Intercepting Route, Triage-Bildschirme, erweiterte
   Registrierungsaktion. `/security-review` (Auth).
4. **Web — Teil 3 und Anträge.** Detailbildschirme, Weiterleitung nach Bestätigung, Antrag je
   Ergebnis, „bewirbt sich als Alumnus" in „Ohne Gruppe", alter Wizard entfernt.
   `/security-review` (entscheidet, wer wohin beantragt).
5. **`notifications` — Aufnahme-Mail je Nutzertyp.**
6. **Web — Einstiegspunkte.** Einstiegskontext und der erste Nudge (Kampagnen-/QR-Links). Die
   übrigen drei Nudges (nach Event-Gastanmeldung, Mitglieder-Teaser, Newsletter) berühren je ein
   anderes Modul und kommen als eigene kleine PRs.

## 9. Go-Live-Bedingungen

Bevor `BDAS_FLAG_ONBOARDING` in Produktion eingeschaltet wird:

- Row-Level Security ist für `onboarding_journeys` aktiv (wie bei den übrigen Tabellen).
- Die Datenschutzerklärung nennt die gespeicherten Antworten und den Einstiegskontext.
- Wenn die BDAJ-Karte sichtbar sein soll: die BDAJ-Gruppe existiert in Produktion.
- `deploy-migrations` hat die onboarding-Migration angewendet.

## 10. Nicht enthalten

- Editor für den Ablauf (Ansatz B).
- Chat-Oberfläche oder KI.
- Vorschläge für Gruppen in Nachbarstädten.
- Die Einzelrechte für BDAJ-Funktionär\*innen.
- Auswertungs-Dashboard für Einstiegsquellen (das Ereignis macht es später möglich).

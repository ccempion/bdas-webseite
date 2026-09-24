# Info-Punkte & Glossar — Design

**Status:** Entwurf zur Durchsicht
**Date:** 2026-09-24
**Affects:** `core/design-system` (neues Bauteil), `apps/web` (Glossar, Platzierungen, Glossar-Seite), `core/feature-flags` (neues Flag)
**Baut auf:** FAQ-Suite v2 (Kontext-Register `apps/web/lib/faq/contexts.ts`, `<FaqHinweis>`), Brainstorming vom 2026-09-16

## 1. Ziel

Neue Leute verstehen die Plattform, ohne jemanden fragen zu müssen. Wo ein Begriff auftaucht, den
man ohne Vorwissen nicht versteht („Lead", „Verteiler", „Ohne Gruppe", „Wechselantrag"), steht ein
kleines „?". Ein Tipp darauf erklärt den Begriff in ein, zwei Sätzen und verweist, wo es mehr gibt,
auf den passenden FAQ-Eintrag. Alle Erklärungen stehen zusätzlich gesammelt auf einer
Glossar-Seite.

Nebenbei hat die Bestandsaufnahme gezeigt, dass einige Dinge unterschiedlich heißen oder ein Wort
zwei Dinge bedeutet. Das löst kein Info-Punkt; dafür gibt es in §8 Umbenennungsvorschläge.

## 2. Entscheidungen

Schon am 2026-09-16 entschieden:

- **D1 — Texte im Code.** Das Glossar ist eine Datei im Repo; Änderungen laufen über einen PR. Die
  Form ist so gewählt, dass die Texte später ohne Umbau in die Datenbank wandern können (§10).
- **D2 — Zuerst der Mitgliederbereich**, dann die Registrierung. Die Registrierung ist inzwischen
  überarbeitet (Wizard auf `main`), deshalb kommt sie jetzt gleich mit.

Neu in dieser Spec, jeweils als Empfehlung — **bitte bestätigen oder ändern**:

- **D3 — Öffnen per Klick/Tipp, nicht per Hover.** Hover gibt es auf dem Handy nicht, und ein
  Klick funktioniert auch mit Tastatur und Screenreader.
- **D4 — „Mehr dazu" über das bestehende FAQ-Kontext-Register**, nicht über feste Links (§5).
- **D5 — Alle unklaren Begriffe kommen ins Glossar**, aber auf einer Seite bekommt ein Begriff
  höchstens einen Info-Punkt, beim ersten Auftreten (§6). Sonst wird aus Hilfe Rauschen.
- **D6 — Eine Glossar-Seite `/faq/begriffe`** listet alle Einträge von A bis Z. Sie kostet fast
  nichts, weil die Datei ohnehin existiert, und ist der Ort, auf den man verlinken kann.
- **D7 — Eigenes Flag `glossar`**, damit die Info-Punkte dunkel ausgeliefert und auf Staging
  geprüft werden können, bevor sie auf bdas.de erscheinen.

## 3. Bauteil `InfoPunkt` (Design-System)

Neu in `core/design-system/src/components/InfoPunkt.tsx`, exportiert über `index.ts`.

```tsx
<InfoPunkt begriff="Verteiler" mehrHref="/faq#…">
  Ein Ordner, in den nur der Bundesvorstand etwas legt …
</InfoPunkt>
```

Das Bauteil kennt kein Glossar. Es bekommt Begriff, Text und optional einen Link. Die Verbindung
zum Glossar macht der App-Wrapper `<Begriff>` (§4).

**Verhalten**

- Ein `<button type="button">` mit einem kleinen „?" im Kreis, direkt hinter dem Wort, auf
  gleicher Grundlinie. Zugänglicher Name: „Was bedeutet ‚Verteiler'?"
- Klick oder Tipp öffnet eine Sprechblase darunter. Die Blase schließt bei erneutem Klick, bei
  Escape, bei Klick außerhalb oder wenn eine andere Blase aufgeht. Es ist immer nur eine offen.
- `aria-expanded` und `aria-controls` am Button. Die Blase ist ein nicht-modales Element mit
  `role="note"`, kein Dialog: sie fängt den Fokus nicht, Tab läuft normal weiter.
- Auf schmalen Bildschirmen (unter `sm`) ist die Blase so breit wie der Inhaltsbereich, statt
  neben dem Wort zu schweben, damit sie nie aus dem Bild ragt.
- Inhalt der Blase: der Begriff fett, darunter der Text, darunter optional „Mehr dazu →".

**Aussehen** — nur Tokens (CLAUDE.md §7), nichts Neues:

- Button: Ink muted (`#888`), bei Hover/Fokus/offen die Akzentfarbe. Der Akzent gilt hier als
  „aktiv/offen"-Zustand, wie in den Regeln vorgesehen.
- Blase: Radius `12px` (wie Dropdowns), weiche Karten-Schatten, Hintergrund `surface`.
  Einblenden mit der Fade-Dauer (~400 ms), Farbwechsel mit der kurzen Dauer (~200 ms).
- Falls für die Größe des „?"-Kreises oder den Blasen-Abstand kein Token passt, wird das beim Bau
  angesprochen, nicht ad hoc gesetzt.

**Tests** (Vitest + Testing Library, wie `Dialog.test.tsx`): öffnet und schließt per Klick, per
Escape und per Klick außerhalb; nur eine Blase offen; `aria-expanded` stimmt; ohne `mehrHref`
kein Link.

## 4. Glossar-Datei

`apps/web/lib/glossar/eintraege.ts`, neben dem FAQ-Kontext-Register. Eine Liste, kein Modul: es
gibt keine Tabellen und keinen Dienst, das Glossar ist Text in der App (wie `contexts.ts`).

```ts
export type GlossarEintrag = {
  readonly key: string; // stabil, z. B. "verteiler" — wird später Primärschlüssel
  readonly begriff: string; // so, wie er in der Oberfläche steht
  readonly varianten?: readonly string[]; // andere Formen im UI, z. B. "Bundesvorstand-Verteiler"
  readonly text: string; // 1–2 Sätze, höchstens ~220 Zeichen
  readonly bereich: Bereich; // Gliederung der Glossar-Seite
  readonly nurFuer?: "vorstand"; // erscheint nur Vorständen auf der Glossar-Seite
};
```

Dazu der App-Wrapper `apps/web/app/_glossar/Begriff.tsx`:

```tsx
<Begriff k="verteiler">Bundesvorstand-Verteiler</Begriff>
```

Er schreibt das Wort hin, schlägt den Eintrag nach und hängt den `InfoPunkt` an. Ist das Flag aus
oder der Key unbekannt, steht nur das Wort da. Ein unbekannter Key ist ein Fehler, den ein Test
findet (§9), keine stille Lücke zur Laufzeit.

**Regeln für die Texte**

1. Du-Form, wie der Rest der Plattform.
2. Die Erklärung benutzt keinen anderen erklärungsbedürftigen Begriff, oder nur einen, der selbst
   im Glossar steht.
3. Sie sagt, was es für die lesende Person **bedeutet** („Über deine Bewerbung entscheidet …"),
   nicht, wie es technisch umgesetzt ist.
4. Der `begriff` ist genau das Wort aus der Oberfläche. Ändert sich das Wort im UI, ändert sich
   der Eintrag im selben PR.

## 5. „Mehr dazu" über das FAQ-Kontext-Register

FAQ-Einträge haben als Anker nur ihre Datenbank-ID. Die ist auf Staging und in Produktion
verschieden und kann sich ändern, taugt also nicht als fester Link im Code.

Stattdessen nutzt das Glossar den Mechanismus, den die FAQ schon hat: Einträge werden an
**Kontexte** gehängt (`faq_entry_contexts`, Schlüssel aus `FAQ_CONTEXTS`). Jeder Glossar-Eintrag
bringt einen Kontext `begriff.<key>` mit. Im FAQ-Editor kann der Vorstand einen Eintrag an
„Begriff: Verteiler" hängen. Ist einer angehängt und für die lesende Person sichtbar, zeigt die
Blase „Mehr dazu →" mit Link auf genau diesen Eintrag. Sonst zeigt sie keinen Link.

- `FAQ_CONTEXTS` bekommt die Begriffs-Kontexte automatisch aus der Glossar-Datei; sie tragen keine
  Routen, weil sie an keinem Pfad hängen, sondern an einem Wort.
- Im Kontext-Auswahlfeld des FAQ-Editors stehen sie gesammelt unter einer Überschrift „Begriffe",
  damit die fünf Seiten-Kontexte nicht darin untergehen.
- Die Sichtbarkeitsprüfung ist dieselbe wie bei `<FaqHinweis>` (`assembleFaq`), damit ein
  Vorstands-Eintrag nie in der Blase eines Mitglieds landet.
- Die Blase lädt den Link erst beim Öffnen (eine kleine Route wie `/api/faq/help`), nicht beim
  Seitenaufbau. Eine Seite mit zehn Info-Punkten macht so keine zehn Datenbankabfragen.

## 6. Wo Info-Punkte stehen

**Regeln**

1. Pro Seite höchstens **ein** Info-Punkt je Begriff, beim ersten sichtbaren Auftreten.
2. Nicht in Buttons, nicht in der Navigation und nicht in Tabellenzellen, die sich pro Zeile
   wiederholen. Dort steht der Punkt einmal an der Spaltenüberschrift oder am Seitentitel.
3. Nicht in Fehlermeldungen. Wer einen Fehler sieht, braucht einen Ausweg, keine Begriffserklärung.
4. Richtwert: nicht mehr als etwa fünf Info-Punkte auf einem Bildschirm. Wird es mehr, ist das ein
   Zeichen, dass die Seite selbst klarer formuliert werden sollte.

**Seiten, erste Runde** (PR 2):

| Bereich         | Seite                                   | Begriffe                                                                                        |
| --------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Registrierung   | Wizard, Schritt „Was beschreibt dich?"  | Hochschulgruppe, Alumni, BDAJ, Förderer\*in                                                     |
| Registrierung   | Wizard, Gruppenwahl                     | Hochschulgruppe, Vorstand, Bewerbung                                                            |
| Registrierung   | Wizard, „Ohne Gruppe vor Ort"           | Ohne Gruppe, Gruppe gründen                                                                     |
| Registrierung   | Wizard, Seitenleiste „Wer entscheidet?" | Bundesvorstand, Vorstand                                                                        |
| Registrierung   | E-Mail-Schritt                          | Bestätigungslink                                                                                |
| Mein Konto      | Übersicht                               | Bewerbung, Warten auf Beitritt, Hauptgruppe, Rolle, Erweitertes Profil                          |
| Mein Konto      | Gruppenwechsel                          | Wechselantrag, Hauptgruppe                                                                      |
| Mein Konto      | Einstellungen                           | Datenexport, Konto löschen, Newsletter                                                          |
| Dashboard       | Übersicht                               | Hochschulgruppe, Lead, Ohne Gruppe                                                              |
| Dateien         | Ordnerliste                             | Alle Mitglieder, Gruppenmitglieder, Lokaler Vorstand, Bundesvorstand, Verteiler, Ordnerfreigabe |
| Veranstaltungen | Detailseite                             | Warteliste, Gastanmeldung, Bundesweit/Föderationsweit                                           |
| Blog            | Liste und Beitrag                       | Kategorie, Melden                                                                               |

**Zweite Runde, Vorstandsbereich** (PR 3):

| Seite                            | Begriffe                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| Rollen & Vorstände               | Lead, Event-Manager, Seiten-Editor, Datei-Manager, Blogger, Alumni-Markierung                     |
| Bewerbungen / Offene Bewerbungen | Bewerbung, Ablehnungsgrund, Notfall-Zuständigkeit                                                 |
| Ohne Gruppe (Pool)               | Ohne Gruppe, Ohne Profil, Ohne Gruppe aufnehmen                                                   |
| Mitglieder                       | Wechselantrag, Alumni-Markierung, Partnerorganisation                                             |
| Events-Editor                    | Sichtbarkeit (Öffentlich / Nur Mitglieder / Nur Gruppe), Föderationsweit, Gäste zulassen, Entwurf |
| Dateien, Freigaben               | Ordnerfreigabe, Verteiler                                                                         |
| Einstiegslinks                   | Einstiegslink                                                                                     |
| Newsletter                       | Bestätigung (Double-Opt-in), unbestätigte Einträge                                                |
| Seiten-Editor                    | Gruppenseite                                                                                      |

## 7. Das Glossar — alle Begriffe mit Entwurfstext

Die Texte sind **Entwürfe**. Sie beschreiben das Verhalten so, wie es heute im Code und in den ADRs
steht; Wortwahl und Ton sind deine Sache. Wo ein Text von einer offenen Namensfrage (§8) abhängt,
ist das markiert.

### 7.1 Verband und Gruppen

| Key                   | Begriff                      | Entwurf                                                                                                                                                                  |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bdas`                | BDAS                         | Der Bund der Alevitischen Studierenden in Deutschland: der bundesweite Verband alevitischer Studierender, getragen von den Hochschulgruppen vor Ort.                     |
| `hochschulgruppe`     | Hochschulgruppe              | Eine BDAS-Gruppe an einem Hochschulort, z. B. BDAS Köln. Sie hat einen eigenen Vorstand, eigene Veranstaltungen und eigene Dateien.                                      |
| `bdaj`                | BDAJ                         | Der Bund der Alevitischen Jugendlichen, der Jugendverband und Partner von BDAS. BDAJ-Mitglieder haben hier einen gemeinsamen Bereich mit BDAS.                           |
| `aabf`                | AABF                         | Die Alevitische Gemeinde Deutschland, der Dachverband der alevitischen Gemeinden in Deutschland.                                                                         |
| `netzwerk`            | BDAS Netzwerk                | Die gemeinsame Gruppe für Förderer\*innen: Leute, die BDAS unterstützen, ohne selbst in einer Hochschulgruppe zu sein. Über die Aufnahme entscheidet der Bundesvorstand. |
| `partnerorganisation` | Partnerorganisation          | Eine Organisation, die mit BDAS zusammenarbeitet und hier einen eigenen Bereich hat, zurzeit die BDAJ. Ihre Mitglieder nimmt der Bundesvorstand auf.                     |
| `bundesweit`          | Föderationsweit / bundesweit | Betrifft den ganzen Verband, nicht nur eine Hochschulgruppe. Föderationsweite Veranstaltungen legt nur der Bundesvorstand an. _(Hängt an §8, N6.)_                       |

### 7.2 Menschen und Nutzertypen

| Key             | Begriff                   | Entwurf                                                                                                                                                                              |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nutzertyp`     | Nutzertyp                 | Was dich am besten beschreibt: studierend, ehemals studierend (Alumni), in der BDAJ aktiv oder Förderer\*in. Davon hängt ab, wer über deine Aufnahme entscheidet und was du siehst.  |
| `mitglied`      | Mitglied                  | Wer aufgenommen ist und entweder zu einer Hochschulgruppe gehört oder als Alumna/Alumnus markiert ist. Mitglieder sehen Mitglieder-Veranstaltungen, Dateien und können kommentieren. |
| `alumni`        | Alumni / Alumna / Alumnus | Ehemalige Studierende. Wer schon Mitglied war, bekommt die Alumni-Markierung; wer sich neu als Alumni bewirbt, wird vom Bundesvorstand aufgenommen.                                  |
| `foerderer`     | Förderer\*in              | Jemand, der BDAS unterstützt oder einfach näher dran sein will, ohne in einer Hochschulgruppe zu sein. Förderer\*innen gehören zum BDAS Netzwerk. _(Schreibweise: §8, N5.)_          |
| `bdaj-mitglied` | BDAJ-Mitglied             | Wer in der BDAJ aktiv ist. Du bekommst Zugang zum gemeinsamen Bereich von BDAJ und BDAS; über die Aufnahme entscheidet der Bundesvorstand.                                           |
| `bdaj-funktion` | Funktion in der BDAJ      | Deine Aufgabe in der BDAJ: Vorstandsmitglied, Mitglied oder Geschäftsstelle. So weiß der Bundesvorstand, welche Zugänge du brauchst.                                                 |
| `gast`          | Gast / Gastanmeldung      | Wer kein Konto hat, kann sich zu öffentlichen Veranstaltungen mit Name und E-Mail als Gast anmelden, wenn die Veranstaltung das erlaubt.                                             |

### 7.3 Aufnahme und Gruppenzugehörigkeit

| Key                      | Begriff                                      | Entwurf                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bewerbung`              | Bewerbung                                    | Dein Antrag, in eine Gruppe aufgenommen zu werden. Darüber entscheidet der Vorstand dieser Gruppe; bis dahin ist sie offen. Nach einer Ablehnung kannst du dich sofort erneut bewerben.                            |
| `warten-auf-beitritt`    | Warten auf Beitritt / Bewerbung eingereicht  | Deine Bewerbung ist angekommen, der Vorstand hat noch nicht entschieden. Du bekommst eine E-Mail, sobald er entschieden hat. _(Hängt an §8, N3.)_                                                                  |
| `aufnahme`               | Aufnahme / aufgenommen                       | Der Vorstand hat deine Bewerbung angenommen. Ab dann bist du Mitglied deiner Gruppe.                                                                                                                               |
| `ablehnungsgrund`        | Ablehnungsgrund                              | Lehnt ein Vorstand eine Bewerbung ab, muss er einen Grund angeben. Die Person sieht ihn. Schreib ihn so, dass du ihn ihr auch direkt sagen würdest.                                                                |
| `hauptgruppe`            | Hauptgruppe                                  | Die Gruppe, zu der du gehörst. Man gehört immer zu höchstens einer. Ein Wechsel geht über einen Wechselantrag.                                                                                                     |
| `wechselantrag`          | Wechselantrag / Gruppenwechsel               | Dein Antrag, in eine andere Gruppe zu wechseln. Darüber entscheidet der Vorstand der neuen Gruppe. Mit dem Wechsel enden deine Rollen in der alten Gruppe.                                                         |
| `ohne-gruppe`            | Ohne Gruppe                                  | Für alle, an deren Studienort es (noch) keine Hochschulgruppe gibt, oder die bewusst keiner beitreten. Über die Aufnahme entscheidet der Bundesvorstand.                                                           |
| `gruppe-gruenden`        | Gruppe gründen                               | Gibt es an deinem Ort keine Hochschulgruppe, kannst du eine aufbauen. Der Bundesvorstand meldet sich und hilft dir dabei.                                                                                          |
| `erweitertes-profil`     | Erweitertes Profil / Profil vervollständigen | Die Angaben über dich, die der Vorstand für die Entscheidung braucht, z. B. Hochschule und Fach. Erst wenn sie vollständig sind, geht deine Bewerbung raus. _(Hängt an §8, N10.)_                                  |
| `bestaetigungslink`      | Bestätigungslink                             | Ein Link in einer E-Mail, mit dem du bestätigst, dass die Adresse dir gehört. Er gilt 24 Stunden und meldet dich im selben Browser gleich an.                                                                      |
| `einstiegslink`          | Einstiegslink                                | _(Vorstand)_ Ein Registrierungslink mit eigener Begrüßung, z. B. für einen Flyer oder eine Veranstaltung. Wer darüber kommt, wird passend begrüßt, und die Plattform merkt sich, über welchen Link die Person kam. |
| `ohne-profil`            | Ohne Profil                                  | _(Vorstand)_ Konten, die sich registriert, aber nie ein Profil angelegt haben. Der Bundesvorstand kann sie löschen, meist sind es verwaiste oder automatisch angelegte Konten.                                     |
| `notfall-zustaendigkeit` | Notfall-Zuständigkeit                        | _(Vorstand)_ Hat eine Gruppe keinen Vorstand, entscheidet der Bundesvorstand über ihre Bewerbungen, damit niemand ewig wartet. Sonst entscheidet immer der Vorstand der Gruppe.                                    |

### 7.4 Rollen

| Key                 | Begriff                  | Entwurf                                                                                                                                                                     |
| ------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rolle`             | Rolle                    | Eine Aufgabe mit zusätzlichen Rechten, z. B. Veranstaltungen verwalten. Rollen gelten für eine Gruppe und vergibt der Lead der Gruppe oder der Bundesvorstand.              |
| `bundesvorstand`    | Bundesvorstand           | Der gewählte Vorstand des ganzen Verbands. Er verwaltet alle Gruppen und entscheidet über Aufnahmen ohne Hochschulgruppe, von Alumni, Förderer\*innen und BDAJ-Mitgliedern. |
| `vorstand`          | Vorstand (deiner Gruppe) | Die Leute, die eine Hochschulgruppe leiten. Sie entscheiden über Bewerbungen und vergeben Rollen in ihrer Gruppe. _(Hängt an §8, N1.)_                                      |
| `lead`              | Lead                     | Der Vorstand einer Hochschulgruppe auf der Plattform: entscheidet über Bewerbungen, verwaltet die Mitglieder und vergibt Rollen in seiner Gruppe. _(Hängt an §8, N1.)_      |
| `event-manager`     | Event-Manager            | Darf alle Veranstaltungen der Gruppe anlegen, bearbeiten und absagen sowie Blogbeiträge schreiben. Ohne Hochschulgruppe nur die eigenen Veranstaltungen.                    |
| `seiten-editor`     | Seiten-Editor            | Darf die öffentliche Seite der Gruppe gestalten. Name und Stadt der Gruppe bleiben fest.                                                                                    |
| `datei-manager`     | Datei-Manager            | Darf im Mitgliederordner der Gruppe Ordner anlegen und Dateien verwalten, aber nicht im Vorstandsordner.                                                                    |
| `blogger`           | Blogger                  | Darf Blogbeiträge schreiben und veröffentlichen.                                                                                                                            |
| `alumni-markierung` | Als Alumnus markieren    | _(Vorstand)_ Kennzeichnet ein Mitglied, das nicht mehr studiert. Es bleibt Mitglied und behält den Zugang.                                                                  |

### 7.5 Dateien

| Key                        | Begriff                  | Entwurf                                                                                                                                                    |
| -------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ordner-alle-mitglieder`   | Alle Mitglieder          | Ein Ordner des Bundesvorstands, den jedes Mitglied im ganzen Verband lesen kann.                                                                           |
| `ordner-gruppenmitglieder` | Gruppenmitglieder        | Der Ordner deiner Hochschulgruppe. Alle Mitglieder der Gruppe können lesen, verwalten dürfen der Lead und Datei-Manager.                                   |
| `ordner-lokaler-vorstand`  | Lokaler Vorstand         | Der interne Ordner des Vorstands deiner Gruppe. Nur der Vorstand sieht ihn. _(Hängt an §8, N1.)_                                                           |
| `ordner-bundesvorstand`    | Bundesvorstand (Ordner)  | Der interne Ordner des Bundesvorstands. Nur der Bundesvorstand sieht ihn.                                                                                  |
| `verteiler`                | Bundesvorstand-Verteiler | Ein Ordner, über den der Bundesvorstand Unterlagen an alle Gruppenvorstände verteilt. Hochladen kann nur der Bundesvorstand, lesen jeder Lead.             |
| `ordnerfreigabe`           | Ordnerfreigabe           | Zugang für eine einzelne Person zu einem bestimmten Ordner, etwa für BDAJ-Mitglieder. Je nach Freigabe nur lesen oder auch hochladen. _(Hängt an §8, N2.)_ |
| `speicherplatz`            | Speicherplatz            | Eine Datei darf höchstens 25 MB groß sein, ein Ordner insgesamt 5 GB.                                                                                      |

### 7.6 Veranstaltungen

| Key               | Begriff        | Entwurf                                                                                                                                                                         |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sichtbarkeit`    | Sichtbarkeit   | _(Vorstand)_ Wer die Veranstaltung sieht: **Öffentlich** alle, auch ohne Konto; **Nur Mitglieder** alle Mitglieder im Verband; **Nur Gruppe** nur die Mitglieder dieser Gruppe. |
| `warteliste`      | Warteliste     | Ist eine Veranstaltung voll, kommst du auf die Warteliste. Sagt jemand ab, rückst du automatisch nach und bekommst eine E-Mail.                                                 |
| `gaeste-zulassen` | Gäste zulassen | _(Vorstand)_ Erlaubt Leuten ohne Konto, sich mit Name und E-Mail anzumelden. Geht nur bei öffentlichen Veranstaltungen.                                                         |
| `entwurf`         | Entwurf        | Noch nicht veröffentlicht. Nur, wer die Veranstaltung oder den Beitrag verwaltet, sieht ihn.                                                                                    |
| `abgesagt`        | Abgesagt       | Die Veranstaltung findet nicht statt. Angemeldete bekommen Bescheid.                                                                                                            |

### 7.7 Blog

| Key          | Begriff    | Entwurf                                                                                                                    |
| ------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `kategorie`  | Kategorie  | Das Thema eines Beitrags. Damit kannst du die Liste filtern.                                                               |
| `melden`     | Melden     | Stört dich ein Beitrag, kannst du ihn melden. Der Bundesvorstand sieht die Meldung und entscheidet, ob der Beitrag bleibt. |
| `kommentare` | Kommentare | Kommentieren können alle Mitglieder und Alumni. Kommentare sind reiner Text, ohne Antworten auf Antworten.                 |

### 7.8 Konto und Datenschutz

| Key              | Begriff                     | Entwurf                                                                                                                                                     |
| ---------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `datenexport`    | Datenexport                 | Lädt alles herunter, was die Plattform über dich gespeichert hat, als Datei. Das ist dein Recht nach der Datenschutz-Grundverordnung. _(Artikel: §11, F4.)_ |
| `konto-loeschen` | Konto löschen               | Dein Konto wird nach 30 Tagen endgültig gelöscht, samt deiner Daten. Bis dahin kannst du es über den Link in der E-Mail zurückholen.                        |
| `reaktivieren`   | Konto reaktivieren          | Holt ein Konto zurück, dessen Löschung du beantragt hast, solange die 30 Tage nicht um sind.                                                                |
| `newsletter`     | Newsletter                  | Ein paar Mal im Jahr eine E-Mail mit Neuem aus dem Verband und den Hochschulgruppen. Du kannst dich jederzeit unter Mein Konto abmelden.                    |
| `double-opt-in`  | Bestätigung (Double-Opt-in) | _(Vorstand)_ Wer sich ohne Konto für den Newsletter einträgt, muss das per E-Mail-Link bestätigen. Unbestätigte Einträge bekommen keine Newsletter.         |
| `andere-geraete` | Andere Geräte abmelden      | Nach einer Passwortänderung wirst du überall sonst abgemeldet, damit niemand mit dem alten Passwort drin bleibt.                                            |

## 8. Uneinheitliche Namen — Vorschläge

Diese Stellen erklärt ein Info-Punkt nicht weg. Jede ist eine **Entscheidung für dich**; ich
schlage jeweils etwas vor. Umgesetzt wird nur, was du bestätigst (PR 4).

| Nr. | Was ist uneinheitlich                                                                                                                                                 | Wo                                               | Vorschlag                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **Vorstand, lokaler Vorstand, Lead, „Lokale Vorstands-Leads"**: seit ADR 0037 gibt es nur noch eine Vorstandsrolle (Lead), das UI benutzt aber vier Namen dafür.      | Mein Konto, Bewerbungen, Dateien, Rollen         | Für Mitglieder „Vorstand deiner Gruppe", als Rollenname „Lead" nur im Vorstandsbereich. „Lokale Vorstands-Leads" wird „Leads".                        |
| N2  | **„Freigabe" bedeutet zwei Dinge**: „Warte auf Freigabe durch den lokalen Vorstand" (Aufnahme) und „Ordnerfreigabe" (Dateizugang).                                    | Mein Konto, Dateien                              | Aufnahme heißt „Aufnahme": „Warte auf Aufnahme durch den Vorstand deiner Gruppe". „Freigabe" bleibt den Ordnern vorbehalten.                          |
| N3  | **Bewerbung, Antrag, Beitritt**: „Warten auf Beitritt", „Bewerbung eingereicht", „Bewerbung abgeschickt" und „Profil eingereicht" beschreiben alle denselben Zustand. | Mein Konto, Wizard                               | Ein Zustand, ein Name: „Bewerbung eingereicht". „Antrag" nur für den Gruppenwechsel („Wechselantrag").                                                |
| N4  | **Event und Veranstaltung**: die Navigation sagt „Events", die Seiten sagen „Veranstaltung".                                                                          | Navigation, Events-Seiten, Rolle „Event-Manager" | „Veranstaltung" im Fließtext, „Events" als kurzer Menüpunkt ist in Ordnung. Die Rolle bleibt „Event-Manager". Alternativ überall „Event". Deine Wahl. |
| N5  | **Gendern**: „Förderer:in" (Mein Konto) neben „Förderer\*in" (Wizard) und „\*innen" in den ADRs.                                                                      | Mein Konto                                       | Einheitlich mit Sternchen: „Förderer\*in".                                                                                                            |
| N6  | **Föderationsweit**: Fachwort aus dem Code; im übrigen UI heißt es „bundesweit" oder „Bundesverband".                                                                 | Events-Editor, Events-Liste                      | „Bundesweit".                                                                                                                                         |
| N7  | **„Abmelden" bedeutet drei Dinge**: vom Konto abmelden, vom Newsletter abmelden, von einer Veranstaltung abmelden.                                                    | Kopfzeile, Newsletter, Events                    | Konto: „Abmelden" (bleibt). Newsletter: „Newsletter abbestellen". Veranstaltung: „Teilnahme absagen".                                                 |
| N8  | **„Ohne Gruppe" heißt im Code „Pool"** (`/federal/pool`), in Plänen und ADRs ebenfalls. Das UI sagt einheitlich „Ohne Gruppe".                                        | Nur intern                                       | Das UI bleibt bei „Ohne Gruppe". Nichts zu tun; nur damit niemand „Pool" ins UI übernimmt.                                                            |
| N9  | **Partnerorganisation, BDAJ, Affiliate**: eine Sache, drei Namen. Es gibt genau eine Partnerorganisation.                                                             | Vorstandsbereich                                 | Solange es nur die BDAJ ist: „BDAJ". „Partnerorganisation" erst, wenn eine zweite dazukommt.                                                          |
| N10 | **Profil, erweitertes Profil, Vorstellung**: Mein Konto unterscheidet „Profil" (Name, Bild) und „erweitertes Profil" (Angaben für die Bewerbung).                     | Mein Konto, /profil                              | „Erweitertes Profil" wird „Angaben für deine Bewerbung", solange die Bewerbung läuft, danach „Über dich".                                             |
| N11 | **„BDAS-Connect"** steht nur in der Seitenbeschreibung für Suchmaschinen, nirgends in der Oberfläche.                                                                 | Metadaten                                        | Entweder die Plattform heißt so (dann auch im UI) oder der Name fliegt raus. Deine Wahl.                                                              |

## 9. Tests

- **Bauteil:** siehe §3.
- **Glossar-Datei:** jeder Key eindeutig; jeder Text höchstens ~220 Zeichen; kein Text enthält
  einen anderen Glossar-Begriff, der nicht selbst einen Eintrag hat (Regel 2 aus §4, soweit
  prüfbar).
- **Verwendung:** ein Test sucht alle `<Begriff k="…">` in `apps/web/app` und prüft, dass jeder Key
  im Glossar existiert. So fällt ein Tippfehler im CI auf, nicht erst beim Nutzer.
- **FAQ-Kontexte:** jeder Glossar-Key erscheint als `begriff.<key>` in `FAQ_CONTEXTS`, und
  `matchContext` findet für keinen Pfad einen Begriffs-Kontext.
- **E2E:** ein Durchlauf auf „Mein Konto": Info-Punkt öffnen, Text sichtbar, Escape schließt.
  Wie beim E2E-Job üblich, nicht blank auf `getByRole("note")` prüfen, sondern mit Name.

## 10. Später: Texte in der Datenbank

Nicht Teil dieser Spec. Weil jeder Eintrag einen stabilen `key` hat und die Datei nur Daten
enthält, geht der Umzug so: eine Tabelle mit denselben Feldern, die Datei wird zum Seed, der
Vorstand bearbeitet die Texte im FAQ-Bereich. Naheliegender Besitzer ist das `faq`-Modul, das die
Kontexte schon kennt. `<Begriff>` ändert sich dabei nicht.

## 11. Offene Fragen

- **F1** — Stimmen D3–D7 (§2)?
- **F2** — Die elf Namensvorschläge in §8: welche übernehmen?
- **F3** — Die Entwurfstexte in §7: passen Ton und Inhalt, fehlt ein Begriff?
- **F4** — Der Datenexport verweist heute auf „Art. 20 DSGVO" (Datenübertragbarkeit), die Spec
  zur Kontolöschung auf Art. 15 (Auskunft). Im Glossartext steht deshalb nur „dein Recht nach der
  Datenschutz-Grundverordnung". Welcher Artikel gemeint ist, sollte jemand mit Datenschutz-Blick
  entscheiden.
- **F5** — Kulturelle Begriffe von den öffentlichen Seiten („Cem" u. a.) sind nicht drin: sie
  stehen in Inhalten, die der Vorstand im Seiten-Editor pflegt, nicht im Code. Sollen sie ins
  Glossar? Dann bräuchte der Seiten-Editor einen Info-Punkt-Baustein.

## 12. PR-Schnitt

1. **Fundament** — `InfoPunkt` im Design-System, Glossar-Datei mit allen Einträgen aus §7,
   `<Begriff>`, Flag `glossar`, Begriffs-Kontexte in `FAQ_CONTEXTS`, Glossar-Seite
   `/faq/begriffe`. Tests aus §9 außer E2E.
2. **Mitgliederbereich und Registrierung** — Platzierungen aus §6, erste Tabelle, plus E2E.
3. **Vorstandsbereich** — Platzierungen aus §6, zweite Tabelle.
4. **Namen** — die bestätigten Punkte aus §8. Jede Umbenennung ändert den passenden
   Glossar-Eintrag im selben PR mit.

Das Flag bleibt aus, bis PR 2 auf Staging durchgeklickt ist.

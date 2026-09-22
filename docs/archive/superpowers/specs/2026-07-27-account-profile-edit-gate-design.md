# Mein Konto: Bild-Upload und vorgelagerter Bearbeiten-Schritt

Datum: 2026-07-27
Betrifft: `/account` (Mein Konto) und den Profil-Wizard unter `/profil`

## Problem

Drei Beobachtungen aus der Nutzung von `/account`:

1. Die Bildunterschrift unter dem Profilbild („Bild ändern") sitzt nicht mittig
   unter dem Kreis.
2. Das Profilbild lässt sich nur per Klick auf den Dateidialog wechseln. Eine
   Datei auf den Kreis zu ziehen ist die naheliegendere Geste und tut heute
   nichts.
3. Wer sein Profil vollständig ausgefüllt hat, sieht seine Daten trotzdem
   dauerhaft als offenes Formular mit Speichern-Button. Die Seite liest sich als
   „unfertig", obwohl nichts zu tun ist, und lädt zu folgenlosen Speicher-Klicks
   ein.

## Nicht-Ziele

- Keine Änderung an den Modulgrenzen. `members` besitzt Name und Gruppe,
  `profile` besitzt die erweiterten Felder; die App-Schicht komponiert.
- Kein Umbau des Signup-Wizards. Der bekommt nur Drag & Drop.
- Kein neues Design-System-Primitive. Die Übersicht ist eine `<dl>` aus
  vorhandenen Tokens.

## Entwurf

### 1. Zentrierte Bildunterschrift

`apps/web/app/account/AccountAvatar.tsx`: der Wrapper ist `flex flex-col gap-2`
und dehnt sich auf die Breite der Header-Spalte. Der 112px-Kreis sitzt am linken
Rand, die Caption beginnt ebenfalls links, ist aber breiter — daraus entsteht der
optische Versatz.

Fix: `items-center` auf dem Wrapper, Caption und Fehlerzeile auf die Avatar-Breite
begrenzen und zentrieren. Keine neuen Tokens.

### 2. Drag & Drop für das Profilbild

`AccountAvatar` (auf `/account`) und `PhotoField` (im Wizard) enthalten heute
denselben Upload-Ablauf: `POST /api/profile/upload-url` → signierter `PUT` →
Callback. Auch die Liste erlaubter MIME-Typen steht zweimal als String-Literal im
`accept`-Attribut.

Das Gemeinsame zieht um:

- `apps/web/app/_profile/photo-upload.ts` (rein, ohne React):
  - `ACCEPTED_IMAGE_TYPES` / `ACCEPT_ATTR`
  - `acceptImageFile(file)` → `null` bei Erfolg, sonst eine deutsche
    Fehlermeldung. Beim Klick-Upload filtert der Dateidialog; beim Drop nicht —
    ein fallengelassenes PDF ist der neue Fehlerfall und braucht dieselbe
    Fehlerzeile wie ein fehlgeschlagener Upload.
- `apps/web/app/_profile/use-photo-drop.ts` (`"use client"`):
  - `usePhotoDrop({ onFile })` → `{ dragging, dropHandlers }`, behandelt
    `dragenter/dragover/dragleave/drop`, nimmt nur die erste Datei.

Zustand beim Ziehen: Akzent-Ring in `#d12020` auf Kreis bzw. Button-Rahmen. Rot
als Aktiv-/Offen-Zustand ist genau der in CLAUDE.md §7 vorgesehene Einsatz.
`Lädt hoch…` bleibt der Busy-Zustand, ungeänderte Fehlerzeile darunter.

### 3. Vorgelagerter „Daten ändern"-Schritt

Gate ist das bereits vorhandene `isProfileComplete(db, userId)` aus
`apps/web/app/_profile/complete.ts`: `profile.completedAt != null` **und**
`member.primaryGroupId != null`. Das ist die Bedingung „alle Daten eingetragen".

- **Profil vollständig** → schreibgeschützte Übersicht plus Button
  **„Daten ändern"**. Der Klick tauscht die Übersicht gegen die Formulare,
  darunter **„Abbrechen"**.
- **Profil unvollständig, Profil-Flag aus, oder noch kein Member** → unverändert
  wie heute: Formulare direkt offen, Überschrift „Profil vervollständigen".

Nach erfolgreichem Speichern klappt die Karte in die Übersicht zurück und zeigt
dort die Erfolgsmeldung. Dafür geben beide Server-Actions ein explizites
`ok: true` zurück — `saveProfileAction` liefert im Erfolgsfall heute `{}`, was
sich vom Initialzustand von `useFormState` nicht unterscheiden lässt.

Komponenten:

- `apps/web/app/account/profile-summary.ts` — reine Funktion
  `buildProfileSummary(input)` → `SummaryRow[]`. Löst die gespeicherten Schlüssel
  in Klartext auf (`ABSCHLUSSART_OPTIONS`, `GEFUNDEN_DURCH_OPTIONS`), formatiert
  das Geburtsdatum als `de-DE` und lässt leere Felder weg. Unit-testbar.
- `apps/web/app/account/EditableProfile.tsx` — `"use client"`, hält `editing` und
  die Erfolgsmeldung, rendert entweder die `<dl>` oder die beiden Formulare. Alle
  Props sind einfache Daten, keine Slots.
- `apps/web/app/account/page.tsx` — entscheidet zwischen beiden Zweigen.

### Doppeltes Gruppen-Feld

`ProfileForm` zeigt „Hochschulgruppe", `EditProfileForm` über `UniGruppeFields`
zusätzlich „BDAS-Gruppe" — beide schreiben `primaryGroupId`. Nebeneinander im
gemeinsamen Bearbeiten-Modus wäre das verwirrend, in der Übersicht ist es eine
Zeile.

`UniGruppeFields` bekommt daher ein `showGruppe`-Prop (Default `true`, der Wizard
bleibt unverändert), und `EditProfileForm` blendet das Feld aus und sendet
`primaryGroupId` nicht mehr mit. `saveProfileFieldsAction` fällt in dem Fall
bereits heute auf `me.member.primaryGroupId` zurück und überspringt
`changePrimaryGroup`.

Damit liegt der Gruppenwechsel allein bei `saveProfileAction` — der einzigen der
beiden Actions, die die Transfer-Semantik aus ADR 0022 vollständig umsetzt
(Antrag stellen, erneute Wahl der aktuellen Gruppe zieht ihn zurück).

### Zwei Speichern-Buttons

Im Bearbeiten-Modus stehen zwei beschriftete Abschnitte, „Stammdaten" und
„Erweitertes Profil", mit je einem Speichern-Button und je einer Server-Action.
Die Actions bleiben unangetastet. Ein einziger Button hieße, beide zu einer
zusammenzulegen; Teilfehler und zwei getrennte Fehlerfeld-Sets müssten dann neu
gedacht werden, ohne dass es das eigentliche Problem — das dauerhaft offene
Formular — zusätzlich löst.

## Tests

Vitest läuft hier mit `environment: "node"` ohne Component-Testing-Setup. Also:

- `apps/web/app/_profile/photo-upload.test.ts` — `acceptImageFile` akzeptiert die
  erlaubten Typen und weist andere mit deutscher Meldung ab.
- `apps/web/app/account/profile-summary.test.ts` — Schlüssel werden zu Klartext,
  Datum als `de-DE`, leere Felder fehlen, „Empfehlung" zeigt den Empfehlernamen.
- `e2e/account-profile.e2e.ts` — vollständiges Profil zeigt Übersicht und
  „Daten ändern"; der Klick öffnet die Formulare; „Abbrechen" schließt sie;
  Speichern klappt zurück und zeigt die Meldung.
- `e2e/profile-onboarding.e2e.ts` wird angepasst: der bestehende Edit-Test wählt
  heute `#konto-primaryGroupId` (entfällt) und liest nach dem ersten Speichern
  Formularwerte — ab dem ersten erfolgreichen Speichern ist das Profil
  vollständig, die Seite zeigt also die Übersicht und der Test muss vorher
  „Daten ändern" klicken.

## Risiken

- `saveProfile` stempelt `completedAt` bei **jedem** erfolgreichen Schreiben (per
  `COALESCE` nur einmal). Ein Member, der die erweiterten Felder erstmals über
  `/account` statt über den Wizard ausfüllt, wechselt damit direkt nach dem
  Speichern in den Übersichtsmodus. Das ist gewollt, ändert aber das Verhalten
  bestehender Tests (siehe oben).
- Der Toggle ist Client-State. Ohne JavaScript bleibt die Übersicht sichtbar und
  „Daten ändern" ist wirkungslos. Für unvollständige Profile — den einzigen Pfad,
  der zum Abschluss der Anmeldung nötig ist — sind die Formulare weiterhin ohne
  JavaScript erreichbar.

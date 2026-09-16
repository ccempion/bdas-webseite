# ADR 0047 — BDAJ-Funktionär\*innen: Rechte-Zuschnitt auf dem Nutzertypen-Fundament

**Status:** Accepted
**Date:** 2026-09-16
**Affects:** `modules/events`, `modules/files`, `apps/web`, `infra/seeds`
**Spec:** [`docs/superpowers/specs/2026-09-07-bdaj-funktionaere-design.md`](../superpowers/specs/2026-09-07-bdaj-funktionaere-design.md)
**Plan:** [`docs/superpowers/plans/2026-09-16-bdaj-rechte.md`](../superpowers/plans/2026-09-16-bdaj-rechte.md)

## Kontext

Die BDAJ-Spec vom 2026-09-07 wurde nie umgesetzt. Ein Korrektur-ADR vom 2026-09-09 („ADR 0040")
liegt nur auf einem nicht gemergten Branch; seine Nummer ist auf `main` längst anders vergeben.
Seitdem hat das Nutzertypen-Fundament (ADR 0043, 0045, 0046) den größten Teil der Mechanik
geliefert: `groups.kind`, `hasGroupScope`, die Vorstandssperre, die Ordnerfreigabe pro Person.
Übrig ist der BDAJ-spezifische Zuschnitt. Dieses ADR hält ihn fest und übernimmt die noch
gültigen Punkte des Branch-ADRs.

## Entscheidung

1. **BDAJ ist eine `affiliate`-Zeile** (`slug = bdaj`), angelegt über den Gruppen-Seed.
2. **Kein Einstieg in diesem Schritt.** Wie eine BDAJ-Person auf die Plattform kommt, gehört in
   die Überarbeitung der Registrierung. Die Spec §5 (Gruppe schon bei der Registrierung setzen)
   ist überholt: der Beitritt ist ein Antrag an die BDAJ-Gruppe, über den der Bundesvorstand
   entscheidet (ADR 0031, 0021). Ein Feature-Flag entfällt: es gibt kein neues Modul und keinen
   Einstieg, den es abschirmen müsste.
3. **Blog nur mit Blogger-Rolle** (übernommen aus dem Branch-ADR). Ohne Hochschulgruppe schaltet
   `event_organizer` kein Blog-Schreibrecht frei. Kein neuer Grant-Wert `blog_author`.
4. **Events: nur eigene.** Wer keine Hochschulgruppe hat, verwaltet über die Event-Manager-Rolle
   nur Veranstaltungen, die er selbst angelegt hat. Maßstab ist `hasGroupScope` des Handelnden,
   nicht die Art der Gruppe des Events — eine Quelle der Wahrheit, wie in der Fundament-Spec.
5. **Eine Ordnerfreigabe erlaubt Lesen und — mit Schreibrecht — Hochladen und das Löschen eigener
   Dateien.** Ordner anlegen, umbenennen, löschen und fremde Dateien löschen bleibt der
   Scope-Regel vorbehalten. Das gilt für jede Freigabe, nicht nur für BDAJ: die Freigabe ist ein
   Zugang zu einem Ordner, keine Verwaltung.
6. **Die Freigabe vergibt der Bundesvorstand auf einer eigenen Seite** unter Dateien. Er kann
   fremde Mitgliederordner nicht öffnen, muss sie aber freigeben können; die Seite zeigt ihm dafür
   alle Ordnernamen mit Pfad. Zur Auswahl stehen aufgenommene Accounts der `affiliate`-Gruppen.

## Konsequenzen

- Die Freigabe pro Person gilt weiter für Unterordner (Fundament II), abweichend von Spec §2
  („keine Vererbung"). Der Bundesvorstand gibt deshalb den engsten passenden Ordner frei.
- Der Bundesvorstand sieht die Namen aller Ordner, nicht deren Inhalt.
- Ein BDAJ-Account ohne Einstieg existiert nicht; bis zur neuen Registrierung ist der Zuschnitt
  nur durch Tests belegt.

# ADR 0055 — Info-Punkte, Glossar und einheitliche Begriffe

**Status:** Accepted
**Date:** 2026-09-24
**Affects:** `core/design-system` (`InfoPunkt`), `apps/web` (Glossar, `<Begriff>`, `/faq/begriffe`, Texte), `core/feature-flags` (`glossar`)
**Spec:** [`docs/archive/superpowers/specs/2026-09-24-info-punkte-glossar-design.md`](../archive/superpowers/specs/2026-09-24-info-punkte-glossar-design.md)

## Kontext

Neue Nutzer\*innen stolperten über Begriffe wie „Lead", „Verteiler" oder „Ohne Gruppe". Die
Bestandsaufnahme zeigte außerdem, dass einige Dinge mehrere Namen trugen und ein Wort mehrere
Dinge bedeutete.

## Entscheidung

1. **Info-Punkte öffnen per Klick**, nie per Hover. Die Blase ist nicht-modal, schließt per
   Klick, Escape oder Klick außerhalb; immer nur eine ist offen.
2. **Das Glossar ist Code** (`apps/web/lib/glossar/eintraege.ts`), mit stabilen Keys, damit es
   später ohne Umbau in die Datenbank wandern kann. `<Begriff k>` und `<BegriffText>` sind der
   einzige Weg, einen Info-Punkt zu setzen; Tests schlagen bei einem unbekannten Key an.
3. **„Mehr dazu" läuft über FAQ-Kontexte** `begriff.<key>`, nicht über feste Links: der Vorstand
   hängt einen FAQ-Eintrag im FAQ-Editor an einen Begriff. Sichtbarkeit wie auf `/faq`.
4. **Ein Info-Punkt je Begriff und Bildschirm**, nie in Buttons, Links, Menüs, Auswahloptionen
   oder sich wiederholenden Tabellenzellen.
5. **Glossar-Seite `/faq/begriffe`**, öffentlich; Vorstandsbegriffe nur für Vorstände.
6. **Flag `glossar`** schaltet die Punkte und die nur dafür nötigen Zusatztexte.
7. **Begriffe in der Oberfläche** (Spec §8):
   - „Lead" ist der Rollenname im Vorstandsbereich; für Mitglieder heißt es „Vorstand deiner
     Gruppe". „Lokaler Vorstand" in Fließtexten und „Lokale Vorstands-Leads" entfallen.
   - „Freigabe" heißt nur noch der Ordnerzugang. Aufnahme in eine Gruppe heißt „Aufnahme" bzw.
     „Bewerbung"; der Zähler im Kopf heißt „offene Anfragen".
   - Ein offener Antrag heißt überall „Bewerbung eingereicht". **„Warten auf Beitritt" bleibt**:
     es ist ein anderer Zustand (aufgenommen, aber ohne Hochschulgruppe). Die Spec hatte beides
     irrtümlich gleichgesetzt.
   - „Förderer\*in" mit Sternchen.
   - „Bundesweit" statt „Föderationsweit".
   - Von einer Veranstaltung: „Teilnahme absagen". „Abmelden" heißt nur noch Konto-Abmeldung.
   - Solange es nur die BDAJ gibt, heißt es „BDAJ" bzw. „BDAJ-Mitglied", nicht
     „Partnerorganisation".
   - „Erweitertes Profil" heißt „Angaben für deine Bewerbung", solange sie offen ist, sonst
     „Über dich".
   - „Veranstaltung" im Fließtext, „Events" als Menüpunkt und in „Event-Manager" (unverändert).

## Konsequenzen

- Die E-Mail-Vorlagen (`modules/notifications`) und Fehlermeldungen in `modules/members` sagen
  noch „lokaler Vorstand". Sie gehören anderen Modulen und folgen in eigenen PRs.
- Die FAQ-Texte in `apps/web/content/faq` und `lib/faq/assemble.ts` sind Inhalt, keine
  Oberflächenbegriffe, und bleiben vorerst, wie sie sind.
- Offen: ob die Plattform „BDAS-Connect" heißt (Spec §8, N11).
- Ändert sich ein Wort in der Oberfläche, ändert sich der Glossar-Eintrag im selben PR.

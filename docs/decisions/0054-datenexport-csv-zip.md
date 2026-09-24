# ADR 0054 — Datenexport als vollständiges JSON und CSV-ZIP

**Status:** Accepted
**Date:** 2026-09-24
**Affects:** `apps/web/lib/data-export`, `apps/web/app/account`, `modules/auth`, `modules/members`, `modules/events`
**Builds on:** ADR 0008 (JSON-Stub der Phase 1), Design-Spec Kontolöschung §6

## Kontext

ADR 0008 lieferte einen JSON-Stub für Art. 20 DSGVO, der nur einen Teil der gespeicherten Daten
enthielt. Die Kontolöschung (Spec §6) verlangt eine vollständige Auskunft vor der Löschung, in einem
Format, das Betroffene ohne Werkzeuge öffnen können.

## Entscheidung

1. **Format.** Der JSON-Download unter `GET /account/datenexport` bleibt und wird vollständig. Neu
   ist `?format=zip` (nur mit Flag `account_deletion`): ein ZIP mit einer CSV je Kategorie und einer
   `LIESMICH.txt`. Ein Manifest führt übersprungene Kategorien auf (Modul-Flag aus, keine
   Mitgliedszeile), damit eine fehlende Datei nicht wie "keine Daten" aussieht.
2. **Kategorien.** Dreizehn CSV-Dateien: `konto.csv`, `sitzungen.csv`, `mitgliedschaft.csv`,
   `rollen.csv`, `gruppenwechsel.csv`, `profil.csv`, `veranstaltungen_anmeldungen.csv`,
   `veranstaltungen_organisiert.csv`, `veranstaltungen_anwesenheit.csv`, `dateien.csv`,
   `blog_beitraege.csv`, `blog_kommentare.csv`, `benachrichtigungen.csv`.
3. **Abhängigkeit `fflate`** für das ZIP. Begründung: bewährte Bibliothek ohne Abhängigkeiten;
   das ZIP-Format (CRC, Header, Zip64-Grenzen, Zeichensatz der Dateinamen) ist fehleranfällig, wenn
   man es selbst schreibt. Verworfen: ein selbst geschriebener STORE-only-Writer.
4. **Scoping-Regel (Sicherheitsentscheidung).** Wessen Daten exportiert werden, entscheidet
   allein die Session. `principalFrom(me)` ist der einzige Konstruktor des Brand-Typs `Principal`.
   Route und Server Action nehmen keine ID und keine E-Mail entgegen; die Route liest nur
   `format`. Die Export-Funktionen der Module filtern nach dem besitzenden Schlüssel.
   Belege: Zwei-Nutzer-Tests je Modul mit exakter Schlüsselmenge, der Assembler-Test, der
   Angriffstest der Route (fremde `userId`/`memberId`/`id`/`email` in der Query werden
   ignoriert) und der Compile-Time-Test des Brands. Ehrlich festgehalten: Die Modul-Funktionen
   vertrauen ihrem ID-Argument by design; die Garantie liegt in der Kompositionsschicht
   (`apps/web`), nicht in den Modulen.
5. **Ausschlüsse.** Nicht exportiert werden: Kennungen anderer Personen (`granted_by`,
   `revoked_by`, `decided_by`, `checked_in_by`, `updatedBy` im Profil), die Session-ID
   (Bearer-Kennung), Token (`guest_cancel_token`), Storage-Schlüssel (Dateischlüssel,
   `coverImageKey` der Veranstaltung), Gastanmeldungen (an eine E-Mail-Adresse gebunden, nicht
   an das Konto) und Dateiinhalte (nur Metadaten). Jede Kategorie wird über ihre Spaltenliste
   projiziert; diese Liste ist die einzige Allowlist für JSON und CSV.
6. **CSV-Zellen.** ISO-Datumswerte, UTF-8-BOM, CRLF, Quoting nach RFC 4180, Formel-Schutz: Beginnt
   ein Wert mit `= + - @` TAB oder CR, bekommt er ein vorangestelltes `'`. Ein Wert wie `-1`
   wird damit zu `'-1`; akzeptiert, wie beim bestehenden Roster-Export.
7. **E-Mail auf Anforderung.** Auf `/account/einstellungen` versendet ein Button das ZIP als
   Anhang (E-Mail B), nur mit Flag `account_deletion`. Ohne Mitgliedszeile geht sie über den
   Gastpfad an die Kontoadresse. **Kein Rate-Limiting** vorerst (eigene Daten an die eigene
   Adresse). Folgearbeit: ein Limiter, etwa über das Zählen von `data_export_ready`-Zeilen in
   `notification_log` oder einen exportierten Auth-Limiter.
8. **Nicht im Datenmodell / bekannte Lücken.** Religion wird nirgends gespeichert. Die
   sensibelsten gespeicherten Felder sind Geburtsdatum, Studienfach und der freie
   Vorstellungstext (alle in `profil.csv`, wie alles andere gescopt). Bekannte Lücke
   (Folgearbeit, nicht umgesetzt): `exportForUser` des Blogs deckt Beiträge und Kommentare ab,
   nicht aber die von der Person **gemeldeten** Beitragsmeldungen (Melder-ID und Grund). Das
   braucht eine Änderung im Blog-Modul.

## Konsequenzen

- PR8 (Orchestrator) kann sich darauf verlassen, dass `buildDataExport`/`toZip` mit einem
  `Principal` eine vollständige, gescopte Auskunft liefern und dass der Versand
  (`sendDataExportAction`) ohne Parameter auskommt. Änderungen an der Löschlogik selbst berührt
  dieser ADR nicht.
- Neue personenbezogene Spalten erscheinen erst im Export, wenn sie in die Spaltenliste der
  Kategorie aufgenommen werden; das ist gewollt (Allowlist).
- Das Blog-Melder-Feld bleibt bis zur Folgearbeit unvollständig.

# Newsletter-Modul — Design-Spec

**Datum:** 2026-09-06
**Status:** Freigegeben (Brainstorming-Session)
**Flag:** `newsletter`

---

## 1. Ziel

Die Plattform sammelt E-Mail-Adressen für einen künftigen Newsletter und
dokumentiert die zugehörige Einwilligung rechtssicher. **Es wird kein
Newsletter versendet** — weder jetzt noch im Rahmen dieses Moduls. Wie der
Versand später erfolgt (eigene Lösung oder externes Werkzeug), ist eine
separate Entscheidung; dieses Modul liefert die Liste, auf die sie sich
stützt.

Zweitziel: die Zahl der Eintragungen maximieren, ohne die Marke zu
beschädigen. Der Bundesvorstand kann die Liste einsehen und als CSV
exportieren.

**Nicht-Ziele:** Newsletter-Versand, Kampagnen-Editor, Vorlagen, Statistiken,
Bounce- und Beschwerde-Verarbeitung, Anbindung eines externen
Versanddienstleisters, Segmentierung nach Themen oder Gruppen,
Exit-Intent-Einblendungen, Interstitials.

---

## 2. Architektur: neues Modul `modules/newsletter`

Nach den Acht Regeln: eigener Ordner, eigenes README, eigene Tabellen, eigene
Migrationen unter `modules/newsletter/migrations/` (registriert in
`infra/migrations/manifest.ts`), typisierte Services ausschließlich über
`index.ts`, Integrationstests gegen Docker-Postgres. Flag `newsletter` wird in
`core/feature-flags` ergänzt und ist in Produktion aus, bis das Modul
abnahmefertig ist.

**Das Modul versendet keine E-Mail und importiert Resend nicht.** Die
Bestätigungsmail für öffentliche Eintragungen läuft über den etablierten Weg:
`modules/newsletter` veröffentlicht ein typisiertes Ereignis auf
`core/events`, `modules/notifications` hält den Subscriber und die Vorlage und
versendet über sein vorhandenes `sendTransactionalToGuest`. Damit bleiben
Regel 1 und 2 gewahrt, und das Modul folgt demselben Muster wie
`members.role.*`, die Bewerbungsmails und die Event-Benachrichtigungen — im
gesamten Repository ruft niemand `sendTransactional` von außerhalb
`modules/notifications` auf.

**Verworfen:** Erweiterung von `modules/notifications` um Abonnenten-Tabellen
(vermischt Versand-Infrastruktur mit Einwilligungs-Ownership); Anbindung eines
externen Dienstes wie Brevo oder CleverReach (zweiter Auftragsverarbeiter,
zweiter AV-Vertrag, und der Einwilligungs- und Abmeldezustand läge in zwei
Systemen, die auseinanderlaufen); Speicherung der Adressen in `modules/members`
(Nicht-Mitglieder haben dort keinen Platz).

---

## 3. Einwilligungsmodell

Der Kern der Spec. Es gibt **zwei Wege in die Liste**, und sie unterscheiden
sich ausschließlich darin, wie die Einwilligung nachgewiesen wird.

### 3.1 Eingeloggte Nutzer — ohne Bestätigungsmail

Wer eingeloggt ist, hat seine Adresse über `/e-mail-bestaetigen` bereits
gegenüber der Plattform verifiziert. Ein bewusstes, protokolliertes Anklicken
im angemeldeten Zustand weist die Einwilligung des Adressinhabers **stärker**
nach als ein Klick in einer Bestätigungsmail — die Authentifizierung ist der
zweite Faktor, den Double-Opt-In sonst herstellen soll. Es geht deshalb keine
Mail raus.

Praktischer Nebeneffekt: Wir kennen die Adresse, also braucht es kein
Eingabefeld. Alle eingeloggten Flächen sind ein **Ein-Klick-Schalter**.

### 3.2 Öffentliche Eintragung — mit Double-Opt-In

Bei anonymer Eintragung ist unbewiesen, dass die eingebende Person der
Adressinhaber ist. Hier gilt vollständiges Double-Opt-In: Zeile auf `pending`,
Bestätigungsmail mit einmaligem Token-Link, Klick setzt auf `subscribed`.

### 3.3 Registrierung — die Plattform-Verifizierung ist die Bestätigung

Die ungehakte Checkbox in `/registrieren` und der zweite Anlauf auf
`/registrieren/erfolg` legen die Zeile auf `pending` an. Sie springt auf
`subscribed`, sobald das ohnehin vorhandene Ereignis `auth.user.verified`
eintrifft. Es geht **keine zweite Mail** raus; die Verifizierungsmail der
Registrierung erledigt beide Bestätigungen. Verifiziert jemand nie, bleibt die
Zeile `pending` und zählt nie zur Liste.

### 3.4 Abschalten ausschließlich unter „Mein Konto"

Harte Regel: Alle Flächen außer `/account` kennen nur „an". Wer bereits
abonniert hat, bekommt sie gar nicht erst angezeigt. Das Abbestellen für
Konto-Inhaber passiert allein in der Newsletter-Karte unter `/account`.
Anonyme Abonnenten ohne Konto nutzen dafür den dauerhaften Token-Link, der in
der Bestätigungsmail mitgeliefert wird.

---

## 4. Datenmodell

Vier Tabellen, alle im alleinigen Besitz des Moduls.

| Tabelle                  | Spalten (Kern)                                                                                                                                                                             | Zweck                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `newsletter_subscribers` | `id, email (unique), user_id (nullable), status, confirm_token_hash, confirm_expires_at, unsubscribe_token_hash, source, source_path, group_id, created_at, confirmed_at, unsubscribed_at` | Ein Abonnement                                |
| `newsletter_consent_log` | `id, subscriber_id, event, occurred_at, ip, user_agent, source, source_path`                                                                                                               | Append-only Nachweis nach Art. 7 Abs. 1 DSGVO |
| `newsletter_rate_limits` | `key (PK), count, window_start, expires_at`                                                                                                                                                | Drosselung der öffentlichen Formulare         |
| `newsletter_prompts`     | `user_id (PK), last_dismissed_at, dismiss_count`                                                                                                                                           | Wiedervorlage der Hinweise, siehe §6          |

**`status`** ist einer von vier Werten:

- `pending` — eingetragen, Bestätigung ausstehend. Zählt nicht zur Liste.
- `subscribed` — bestätigt, auf der Liste.
- `unsubscribed` — hat abbestellt.
- `declined` — hat die Hinweise dreimal weggeklickt, ohne zu abonnieren (siehe
  §6.1). Die Plattform fragt nicht erneut, und die Person war nachweislich nie
  auf der Liste. Fachlich verschieden von `unsubscribed`, deshalb ein eigener
  Wert.

**`email` ist der Dublettenschlüssel** und eindeutig, kleingeschrieben und
getrimmt gespeichert. Bei Zeilen mit gesetzter `user_id` gilt beim Lesen,
Anzeigen und Exportieren jedoch die **aktuelle Kontoadresse**, aufgelöst über
den öffentlichen Service von `modules/members`. Der gespeicherte Wert ist dann
nur noch Dublettenschlüssel und darf veralten. Damit wandert die Adresse
automatisch mit, wenn jemand sie im Konto ändert, und es entsteht keine zweite
Wahrheitsquelle für personenbezogene Daten.

Der eindeutige Index greift damit nicht in einem Randfall: Ändert ein Mitglied
seine Kontoadresse von A auf B und trägt sich danach jemand öffentlich mit B
ein, entstehen zwei Zeilen, die auf dieselbe aufgelöste Adresse zeigen.
`listSubscribers` und der CSV-Export entdoppeln deshalb **auf der aufgelösten
Adresse**, wobei die Zeile mit `user_id` gewinnt. Ein Nachziehen des
Schlüssels über ein Ereignis der Adressänderung wurde erwogen und verworfen:
Es setzt ein Ereignis voraus, das `modules/auth` heute nicht veröffentlicht,
und die Entdopplung beim Lesen kostet nichts.

**`source`** ist einer aus `footer`, `registrierung`, `registrierung_erfolg`,
`konto`, `dashboard_hinweis`, `blog`, `event_gast`, `puck_block`,
`scroll_panel`, `landingpage`. Zusammen mit `source_path` und dem optionalen
`group_id` sind das die Metadaten, die eine spätere Auswertung oder
Segmentierung ermöglichen, **ohne** heute eine Auswahl-UI zu bauen, die die
Abschlussquote drückt.

**`newsletter_rate_limits`** ist eine bewusste Kopie des Fixed-Window-Verfahrens
aus `modules/auth/src/rate-limit.ts`, rund 40 Zeilen. Das Original ist an
`auth_rate_limits` gebunden und nicht aus `index.ts` exportiert; ein Zugriff
darauf wäre ein modulübergreifender Tabellenzugriff und damit ein Bruch von
Regel 1. Eine Extraktion des Algorithmus nach `core/` wurde erwogen und
verworfen, weil sie `modules/auth` anfasst und einen Security-Review auf einen
ansonsten harmlosen PR zieht. Bei einem dritten Verwendungsort ist die
Extraktion erneut zu prüfen.

**Tokens** sind 32 zufällige Bytes, als SHA-256-Hash gespeichert, nie im
Klartext. Das Bestätigungstoken läuft nach 7 Tagen ab und ist einmalig
verwendbar; das Abmeldetoken läuft nicht ab. Dies weicht bewusst von
`events.guestCancelToken` ab, das im Klartext liegt: Ein Token, das eine
Einwilligung erzeugt, verdient den stärkeren Schutz.

---

## 5. Öffentliche Modul-Oberfläche (`index.ts`)

```
subscribeAsUser(db, { userId, source, sourcePath, context })   → Subscription
subscribePublicly(db, { email, source, sourcePath, context })  → void
declineForUser(db, { userId })                                  → void
confirmSubscription(db, token)                                  → ConfirmResult
unsubscribeByToken(db, token)                                   → void
unsubscribeAsUser(db, { userId })                               → void
getSubscriptionForUser(db, userId)                              → Subscription | null
listSubscribers(db, filter)                                     → SubscriberRow[]
countSubscribers(db)                                            → Counts
registerNewsletterSubscribers()                                 → void
```

`context` bündelt IP und User-Agent für das Einwilligungsprotokoll.
`registerNewsletterSubscribers` verdrahtet den Handler für
`auth.user.verified` und wird beim Boot in `instrumentation.ts` aufgerufen.

Ereignisse, die das Modul veröffentlicht:
`newsletter.confirmation_requested` (Adresse, Token im Klartext, Ziel-URL) und
`newsletter.already_subscribed` (Adresse).

---

## 6. Erfassungspunkte

Gewählte Tonalität: **offensiv**, aber ohne Exit-Intent und ohne
Interstitials.

| Fläche                            | Ausgeloggt                                  | Eingeloggt, nicht abonniert | Eingeloggt, abonniert |
| --------------------------------- | ------------------------------------------- | --------------------------- | --------------------- |
| `/account`-Karte                  | —                                           | Ein-Klick an                | **Ein-Klick aus**     |
| Dashboard-Hinweis                 | —                                           | Ein-Klick an, wegklickbar   | ausgeblendet          |
| `/registrieren` (Checkbox)        | ungehakt, erzeugt `pending`                 | —                           | —                     |
| `/registrieren/erfolg`            | zweiter, weicherer Anlauf                   | —                           | —                     |
| Footer (alle öffentlichen Seiten) | Eingabefeld, Double-Opt-In                  | Ein-Klick an                | ausgeblendet          |
| Blogartikel-Ende                  | Eingabefeld, Double-Opt-In                  | Ein-Klick an                | ausgeblendet          |
| Puck-Block „Newsletter-Anmeldung" | Eingabefeld, Double-Opt-In                  | Ein-Klick an                | ausgeblendet          |
| Scroll-Panel ab 50 % Scrolltiefe  | Eingabefeld, wegklickbar, Merker im Browser | Ein-Klick an                | ausgeblendet          |
| `/newsletter` (eigene Seite)      | Eingabefeld, Double-Opt-In                  | Ein-Klick an                | Hinweis „schon dabei" |
| Event-Gastanmeldung (Checkbox)    | ungehakt, Double-Opt-In                     | —                           | —                     |

Der Dashboard-Hinweis für Bestandsmitglieder ist der größte Einzelhebel: Diese
Adressen sind bereits verifiziert und die Affinität ist hoch. Die
`/newsletter`-Seite existiert vor allem als Ziel für die Instagram- und
LinkedIn-Bio, die beide im Footer verlinkt sind.

**Ruhe nach der Eintragung.** Eingeloggte Abonnenten sehen keine dieser Flächen
mehr. Nach einer anonymen Eintragung setzen wir einen Merker im Browser-Speicher,
damit auch dort nichts mehr aufpoppt.

### 6.1 Wegklicken heißt „nicht jetzt", nicht „nein"

Gilt für die beiden unterbrechenden Hinweise, den Dashboard-Hinweis und das
Scroll-Panel. Beide verwenden dieselbe Logik — zwei verschiedene
Gedächtnisregeln für zwei Hinweise auf dieselbe Sache wären weder baubar noch
erklärbar.

- **Gäste (ausgeloggt):** Merker in der Sitzung (`sessionStorage`). Das Panel
  bleibt für den Rest des Besuchs weg und ist beim nächsten Besuch wieder da.
  Bewusst die Sitzung und nicht die einzelne Seite: Erschiene es beim nächsten
  Klick sofort wieder, läse sich das als Fehler, nicht als Werbung.
- **Angemeldete:** Wiedervorlage nach **14 Tagen**, serverseitig in
  `newsletter_prompts` gespeichert. Serverseitig, weil die Entscheidung dem
  Menschen über seine Geräte folgen soll — und weil §25 TDDDG damit gar nicht
  erst greift.
- **Deckel bei drei Wegklicks.** Danach dauerhaft Ruhe, `status` geht auf
  `declined`. Wer dreimal wegklickt, hat geantwortet. Keine Rechtspflicht,
  sondern Anstand: unbegrenztes Nachfassen ist der Punkt, an dem „offensiv" in
  „nervig" kippt.

Rechtlich ist die Wiedervorlage unbedenklich: Ein Formular wiederholt
anzuzeigen berührt weder DSGVO noch UWG, und der Merker für den Wegklick fällt
unter die Ausnahme in §25 Abs. 2 TDDDG, weil er genau die vom Nutzer
angeforderte Handlung umsetzt. Kein Einwilligungsbanner nötig.

Unverändert gilt: Wer abonniert hat oder `declined` ist, sieht keinen der
beiden Hinweise.

Die Seite `/newsletter` ist die eine Ausnahme von §3.4: Sie kann sich nicht
selbst ausblenden, weil sie das direkte Ziel eines Links ist. Bereits
abonnierte Eingeloggte sehen dort einen Hinweis, dass sie dabei sind, mit
Verweis auf `/account` zum Abschalten — kein Schalter auf der Seite selbst.

**Der Puck-Block** rendert als Client-Komponente mit einer nicht absendenden
Vorschau im Editor-Modus — die Puck-Leinwand hat keinen Server-Kontext, siehe
den Kommentar an `PublicFooterView`. Er erlaubt der Redaktion, das Feld ohne
Code-Änderung auf beliebigen Inhaltsseiten zu platzieren.

**Rechtlich verbindlich** an jedem Erfassungspunkt: Die Checkbox ist nie
vorausgewählt, die Einwilligung ist nie an eine andere Handlung gekoppelt
(Registrierung und Event-Anmeldung funktionieren ohne sie vollständig), und
neben jedem Formular steht ein Verweis auf `/datenschutz`.

---

## 7. Ereignisse und die synchrone Bus-Semantik

`core/events` ist **synchron**: Handler laufen in Registrierungsreihenfolge,
und wirft ein Handler, schlägt der Fehler zum Publisher durch, damit dieser
seine Transaktion zurückrollen kann.

Daraus folgen zwei harte Regeln:

1. **Der Newsletter-Handler für `auth.user.verified` darf niemals werfen.** Er
   fängt jeden Fehler und protokolliert ihn. Andernfalls würde ein Fehler im
   Newsletter die E-Mail-Verifizierung eines Nutzers scheitern lassen — ein
   nebensächliches Feature legte damit den Kernpfad der Registrierung lahm.
2. **Der Versand-Handler für `newsletter.confirmation_requested` darf niemals
   werfen.** `sendTransactional` schreibt Fehlschläge ohnehin als `failed`-Zeile
   fort, der Fehlschlag geht also nicht lautlos verloren. Die Oberfläche
   antwortet optimistisch und bietet „Bestätigungsmail erneut senden" an, nach
   dem Vorbild von `/verifizierung-erneut-senden`.

Der Bus liegt als `globalThis`-gestützter Singleton vor (`Symbol.for`), seit
`965b043`. Ohne das sehen Route-Handler die beim Boot registrierten Subscriber
nicht — der Fehler, der schon einmal Uploads und Benachrichtigungen lahmgelegt
hat. Ein Integrationstest sichert ab, dass der Newsletter-Subscriber aus einem
Route-Handler heraus tatsächlich feuert.

---

## 8. Missbrauchsschutz und Sicherheit

Ein öffentliches Formular, das eine Mail an eine frei eingegebene Adresse
auslöst, ist ein Werkzeug zum Zumüllen fremder Postfächer. Fünf Maßnahmen:

1. **Drosselung** über `newsletter_rate_limits`: 5 Eintragungen pro IP und
   Stunde; höchstens 1 Bestätigungsmail je Adresse in 15 Minuten und 3 pro Tag.
2. **Honeypot-Feld** statt CAPTCHA — ein für Menschen unsichtbares Feld, das
   nur Bots ausfüllen. Sollten echte Bots durchkommen, ist Vercel BotID der
   nächste Schritt.
3. **Kein nutzergesteuerter Inhalt in der Mail.** Die Vorlage ist fest, nur der
   Bestätigungslink variiert. Damit taugt das Formular nicht als Versandkanal
   für fremde Texte.
4. **Immer identische Antwort** („Prüfe dein Postfach"), gleichgültig ob die
   Adresse neu, bereits eingetragen, abgemeldet oder ein bestehendes Konto ist.
   Andernfalls wird das Formular zum Prüfwerkzeug, ob eine bestimmte Person
   Mitglied bei euch ist.
5. **Tokens** wie in §4: 32 Byte Zufall, SHA-256 gespeichert, Bestätigung
   einmalig und nach 7 Tagen abgelaufen.

Die Board-Ansicht und der CSV-Export sind auf die Rolle `federal_board`
beschränkt und liegen unter `/federal/newsletter`, analog zur FAQ-Suite. Ein
Export-Protokoll wurde erwogen und bewusst weggelassen.

---

## 9. Fehlerfälle

| Fall                                            | Verhalten                                                                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Bestätigungstoken abgelaufen                    | Seite bietet eine neue Eintragung an, kein Fehlerbild                                                                              |
| Bestätigungstoken bereits verwendet             | Freundliche Bestätigung statt Fehler — solche Links werden regelmäßig zweimal geklickt                                             |
| Bestätigungsmail kommt nicht an                 | „Erneut senden"-Pfad, gedrosselt wie in §8                                                                                         |
| Adresse bereits `subscribed`                    | Keine zweite Zeile; Ereignis `newsletter.already_subscribed` löst eine „du bist schon dabei"-Mail aus. Nach außen dieselbe Antwort |
| Adresse war `unsubscribed`                      | Neue Eintragung ist eine neue Einwilligung; Protokolleintrag `resubscribed`                                                        |
| Öffentliche Adresse gehört zu bestehendem Konto | Beim nächsten Login wird die Zeile über den eindeutigen E-Mail-Schlüssel mit `user_id` verknüpft                                   |
| Nutzer ändert seine Kontoadresse                | Nichts zu tun — die Adresse wird bei `user_id`-Zeilen live aufgelöst                                                               |
| Versanddienst nicht erreichbar                  | Zeile bleibt `pending`, Fehlschlag als `failed`-Zeile protokolliert, Nutzer sieht den Erneut-Pfad                                  |

---

## 10. Datenschutz und Aufbewahrung

`newsletter_consent_log` ist append-only und der Nachweis nach Art. 7 Abs. 1
DSGVO, dass eine Einwilligung erteilt wurde. Ein überschreibbares Statusfeld
weist nichts nach — genau dieses Protokoll ist es, was die Liste in zwei Jahren
noch benutzbar macht.

Die IP wird im Klartext gespeichert, nicht gehasht. Eine gehashte IP ist als
Nachweis wertlos, und der Nachweis ist der einzige Zweck der Spalte.
Aufbewahrung: Löschung des Protokolleintrags spätestens drei Jahre nach dem
Ende des Abonnements.

Bei Löschung eines Kontos fallen Abonnement **und** Einwilligungsprotokoll mit.
Das Löschrecht schlägt hier die Nachweispflicht, weil der Nachweis nur so lange
gebraucht wird, wie die Verarbeitung läuft.

Der Datenschutzhinweis unter `/datenschutz` ist um den Verarbeitungszweck
„Newsletter" zu ergänzen; `docs/datenschutz/` ist entsprechend fortzuschreiben.

---

## 11. Tests

Integrationstests laufen gegen echtes Postgres im Docker, keine
Datenbank-Mocks (Regel 5). Der Notifier wird im Test über `setNotifier`
ersetzt.

- **Unit:** Token-Erzeugung und -Hashing, Zustandsübergänge über alle vier
  `status`-Werte, Dublettenauflösung, Fixed-Window-Drosselung an den
  Fenstergrenzen.
- **Integration:** Öffentliche Eintragung erzeugt `pending` plus
  Protokolleintrag; Bestätigung setzt `subscribed`; `auth.user.verified` hebt
  eine Registrierungs-Zeile; ein werfender Newsletter-Handler bricht die
  Verifizierung **nicht** ab; der Subscriber feuert aus einem Route-Handler
  heraus (Bundling-Falle aus §7).
- **E2E (Playwright):** Öffentliche Eintragung bis `confirmed`; Ein-Klick im
  Konto; Abschalten gelingt nur unter `/account`; alle Flächen verschwinden
  nach dem Abonnieren; Board sieht die Liste, ein Nicht-Board-Konto nicht.

---

## 12. Schnitt in fünf PRs

Jeder PR ist für sich reviewbar, alles hinter Flag `newsletter`.

1. **Modul-Fundament** — Schema, Migrationen samt Manifest-Eintrag, Services,
   Flag, README, Integrationstests. Keine Oberfläche.
2. **Eingeloggte Flächen** — `/account`-Karte, Dashboard-Hinweis, Checkbox in
   `/registrieren` und auf der Erfolgsseite, Handler für `auth.user.verified`.
3. **Öffentliche Erfassung** — Vorlage `newsletter_confirm` und
   `newsletter_already_subscribed` in `modules/notifications`, Bestätigungs- und
   Abmelderoute, Drosselung, Honeypot, Footer und `/newsletter`. Zusätzlich
   `/security-review`.
4. **Offensive Flächen** — Blogartikel-Ende, Puck-Block, Scroll-Panel,
   Checkbox in der Event-Gastanmeldung.
5. **Board-Ansicht** — `/federal/newsletter` mit Liste, Kennzahlen, Filter und
   CSV-Export; Nav-Eintrag in `FEDERAL_NAV`.

Begleitend ein ADR unter `docs/decisions/0034-newsletter-consent-model.md` für
die begründungsbedürftige Entscheidung aus §3: Einwilligung ohne
Bestätigungsmail für eingeloggte Nutzer, mit Bestätigungsmail für alle anderen.

---

## 13. Gestaltung

Entschieden in der Brainstorming-Session vom 2026-09-06 anhand von Mustern, die
mit den echten Token gezeichnet waren. Der Musterbogen liegt als Artifact unter
`https://claude.ai/code/artifact/5e0a18cf-21de-4b6f-893b-b5c71c6c8155`.

| Fläche             | Gewählt                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- |
| Footer             | **A3** — abgesetzte Karte über der Fußzeile, nicht als fünfte Spalte                   |
| `/account`         | **B1** — Zeile mit Schalter in der bestehenden Sammelkarte, keine eigene Karte         |
| Dashboard-Hinweis  | **C1** — Banner über dem Inhalt, direkt unter der Begrüßung                            |
| Scroll-Panel       | **D2** — Leiste über die volle Breite am unteren Rand, mit Wiedervorlage nach §6.1     |
| Registrierung      | **E2** — abgesetzter Kasten mit Nutzenzeile und Datenschutz-Verweis, Checkbox ungehakt |
| Tonalität          | **F2** — einladend, „wir", Duzen. Gilt einheitlich auf allen Flächen                   |
| Zustände           | **G** — wie im Musterbogen, siehe §13.2                                                |
| Blickfang in A3/C1 | **H2** — rotes Feld mit Marken-Sweep, ohne Motiv. Siehe §13.3                          |

### 13.1 Was das an der Bildsprache kostet

A3 und C1 verwendeten im ersten Entwurf den roten Akzentbalken. Der ist in
`tokens.ts` dem geöffneten Akkordeon zugeordnet („on `[open]` left border +
halo") und wurde auf Wunsch wieder entfernt — ersetzt durch den Blickfang aus
§13.3. Was auch immer dort gewählt wird, braucht eine Zeile in
`core/design-system/README.md`: CLAUDE.md §7 verlangt, dass Erweiterungen der
Bildsprache angemeldet und nicht nebenbei eingeführt werden.

### 13.2 Zustände nach dem Absenden

Vier Zustände, Texte in F2-Tonalität:

- **Wird gesendet** — Knopf abgedunkelt, Beschriftung „Wird eingetragen …".
- **Öffentlich, Erfolg** — „Fast geschafft. Wir haben dir eine E-Mail
  geschickt. Bestätige darin einmal, dann bist du dabei."
- **Eingeloggt, Erfolg** — „Du bist dabei. Abschalten kannst du das jederzeit
  unter Mein Konto."
- **Link abgelaufen** — „Dieser Link ist abgelaufen. Bestätigungslinks gelten
  sieben Tage. Trag dich einfach noch einmal ein." plus Sekundärknopf.

**Der zweite Zustand erscheint wortgleich** für eine unbekannte, eine bereits
eingetragene und eine früher abgemeldete Adresse. Der Unterschied wird
ausschließlich im Postfach sichtbar (§9). Andernfalls könnte jeder Besucher
fremde Adressen eintippen und herausfinden, wer auf der Liste steht — also ob
eine Person dem alevitischen Studierendenverband nahesteht. Das ist
Zugehörigkeit im Sinne von Art. 9 DSGVO. Auch die **Antwortzeit** muss in allen
drei Fällen ähnlich sein, sonst verrät die Dauer, was der Text verschweigt.

### 13.3 Blickfang: H2 — rotes Feld mit Marken-Sweep

Ersetzt den roten Balken in A3 und C1. Gewählt ist **H2**, ohne Bildmotiv: Die
Fläche wird selbst zum Akzent — volles Markenrot, weiße Schrift, weißer Knopf —
und beim Erscheinen zieht das Lichtband des Marken-Laders einmal quer darüber.
Der Verlauf ist `colors.surface.overlay.loaderShine`, unverändert übernommen,
Richtung wie beim Logo von unten-links nach oben-rechts, Dauer
`motion.durationLoop` (1600 ms). Einmal beim Hereinscrollen, erneut beim
Überfahren, gar nicht bei `prefers-reduced-motion`.

Der Vorzug gegenüber einer frei erfundenen Bewegung: Es ist bereits eure Geste.
Die Fläche wirkt auffällig, ohne fremd zu wirken, und es entsteht kein neuer
Wert in `tokens.ts` — nur eine neue Verwendung eines vorhandenen.

**Was H2 an neuen Token braucht:** Rot als Flächenfarbe und Weiß als Schrift
darauf. Beides steht so noch nicht in `tokens.ts`; vorgesehen sind
`colors.ink.onBrand` und eine Knopf-Variante `on-brand`. Dazu die Zeile im
Design-System-README nach §13.1.

**Ein Bildmotiv im Feld ist vertagt** (§14), nicht verworfen. Erwogen wurden ein
Saz und ein Hirsch als einfarbige weiße Strichzeichnung, die das Lichtband beim
Vorbeiziehen kurz hervorhebt. Das ist rein additiv: Es legt sich später in
dieselbe Fläche, ohne H2 zu verändern.

### 13.4 Noch nicht festgelegt

Für jede Fläche fehlen weiterhin die konkreten Token-Zuweisungen, die
Fokusreihenfolge, die `aria-live`-Region für Ergebnismeldungen und das
Verhalten der Leiste D2 auf schmalen Geräten unterhalb von 360 px. Das gehört in
den Implementierungsplan der jeweiligen PR, nicht in diese Spec.

---

## 14. Vertagt

- Versand jeglicher Art, inklusive der Wahl eines Versandwerkzeugs.
- Segmentierung nach Themen oder Hochschulgruppen. Die Metadaten `source`,
  `source_path` und `group_id` werden ab Tag 1 mitgeschrieben, damit dies
  später eine reine Auswertungsfrage ist und keine Migration.
- Ein Verteiler je Hochschulgruppe mit eigenem Zugriff für lokale Vorstände.
- Kennzahl je Gruppe („wie viele Eintragungen stammen aus unserem Umfeld").
- Extraktion des Drosselungs-Algorithmus nach `core/`, siehe §4.
- Bounce- und Beschwerde-Verarbeitung; entsteht erst mit dem Versand.
- **Bildmotiv im Blickfang** (§13.3). Ein Saz oder ein Hirsch als einfarbige
  weiße Strichzeichnung, die das Lichtband beim Vorbeiziehen kurz hervorhebt.
  Rein additiv zu H2. Voraussetzung ist eine SVG-Strichzeichnung ohne Füllung,
  mit gleichmäßiger Strichstärke und — entscheidend — **den Saiten als eigenen
  Pfaden**, sonst lassen sie sich nicht einzeln animieren. Lizenz für
  kommerzielle Nutzung auf einer Website nötig. Inhaltlich gilt: ein Instrument
  oder ein Tier, kein Personenbildnis; ein Porträt von Hacı Bektaş Veli in einem
  Anmeldekasten könnte als Vereinnahmung gelesen werden und wäre eine
  Entscheidung des Bundesvorstands, nicht der Umsetzung.
- **Ton.** Klang beim Erscheinen ist ausgeschlossen — Browser sperren Audio ohne
  vorherige Nutzerinteraktion, und unaufgeforderte Musik auf einer
  Verbandsseite wäre ohnehin ein Fehler. Falls überhaupt, dann als bewusster
  Klick auf eine Zeile „Saz anhören", stumm voreingestellt, zwei Sekunden, keine
  Schleife, mit geklärten Rechten an der Audiodatei.

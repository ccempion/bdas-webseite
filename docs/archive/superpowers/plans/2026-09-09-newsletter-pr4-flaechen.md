# Newsletter PR 4 — Offensive Flächen

**Goal:** Die verbleibenden Erfassungspunkte aus Spec §6: Puck-Block
„Newsletter-Anmeldung", Scroll-Panel auf langen Seiten und die Checkbox in der
Event-Gastanmeldung. **Das Blogartikel-Ende entfällt** — Begründung unten.

**Architecture:** Fachlich ist nichts Neues nötig — `modules/newsletter` kann seit PR 1
alles (`subscribePublicly`, `subscribeAsUser`, `shouldPrompt`, `declineForUser`,
Deckel bei drei Wegklicks). PR 4 ist reine App-Schicht: vier Einbauorte für dieselbe
Entscheidung.

**Spec:** `docs/superpowers/specs/2026-09-06-newsletter-modul-design.md` §6 und §6.1
(Branch `docs/newsletter-modul-spec`, **nicht auf main**). Vorgänger:
`2026-09-08-newsletter-pr3.md`.

---

## Die Leitentscheidung: eine Fläche pro Seite, und der Footer deckt das Ende ab

Die Footer-Karte steht seit PR 3 auf **jeder** öffentlichen Seite. Damit ist das
Seitenende bereits belegt. Eine zweite Fläche dort wäre keine Betonung, sondern
dasselbe Angebot zweimal untereinander.

Daraus folgt eine Regel, die den Zuschnitt dieses PRs bestimmt:

> **Inline-Flächen sind für die Seitenmitte. Das Seitenende gehört dem Footer.**

**Das Blogartikel-Ende entfällt deshalb** (Abweichung von Spec §6, mit Absicht). Wer
einen Artikel zu Ende liest, ist am Seitenende — genau dort, wo die Footer-Karte
ohnehin steht. Nachgemessen: Die Artikelseite endet mit den Kommentaren, unmittelbar
danach kommt der Footer mit der Karte; sind Kommentare abgeschaltet oder leer, stünden
beide Felder direkt aufeinander. Der Erfassungspunkt ist nicht verloren, er ist schon
besetzt.

Dieselbe Regel begrenzt auch das Scroll-Panel (siehe Entscheidung 6).

## Die eine Entscheidung, die dieser PR mehrfach treffen müsste — und einmal trifft

Der Puck-Block und das Scroll-Panel zeigen laut §6 dieselbe Matrix:

| Betrachter                  | Was erscheint               |
| --------------------------- | --------------------------- |
| ausgeloggt                  | Eingabefeld, Double-Opt-In  |
| eingeloggt, nicht abonniert | Ein-Klick-Knopf, keine Mail |
| eingeloggt, abonniert       | nichts                      |
| eingeloggt, `declined`      | nichts                      |

Diese Matrix zweimal zu schreiben hieße, sie auseinanderdriften zu lassen — und PR 5
sowie jede spätere Fläche bräuchten sie erneut. Sie bekommt deshalb **eine** Heimat.
Die Event-Checkbox fällt bewusst heraus: Sie ist kein eigenständiger Aufruf, sondern
ein Häkchen in einem fremden Formular.

## Entscheidungen, die dieser Plan über die Spec hinaus trifft

1. **Die Matrix ist eine präsentationale Komponente mit einem `state`-Prop, keine
   Server-Komponente.** Ursprünglich war `NewsletterInline` als Server-Komponente
   geplant, die den Status selbst liest. Mit dem Wegfall des Blogartikel-Endes hat sie
   keinen Aufrufer mehr, der das könnte: Der Puck-Block ist ein Client-Baum, und beim
   Scroll-Panel liest die Wirtsseite den Status ohnehin selbst. Deshalb zwei Teile:
   `readNewsletterViewerState()` (Server, liest Flag + Sitzung + Abo) und
   `NewsletterOffer` (präsentational, bekommt den Zustand gereicht). Das funktioniert in
   beiden Welten und hat keinen toten Code.
2. **Der Puck-Block bekommt den Betrachterzustand über Puck-`metadata`,** nicht über
   einen eigenen Datenbankzugriff. Die Leinwand ist ein Client-Baum ohne Server-Kontext —
   dasselbe Problem, das `canvas-chrome.ts` für die Navigation schon gelöst hat, und
   dieselbe Lösung. Im Editor steht der Zustand fest auf „Vorschau, sendet nicht".
   `metadata` ist in `@puckeditor/core@0.23.0` in den Typdeklarationen vorhanden;
   die genaue Aufrufform wird in Task 2 Schritt 1 gegen die Deklaration geprüft, nicht
   angenommen.
3. **Das Scroll-Panel entscheidet zweistufig:** Der Server sagt, ob es überhaupt je
   erscheinen darf (`shouldPrompt` bzw. „ausgeloggt und kein Merker"), der Client sagt
   wann (50 % Scrolltiefe). Ein Panel, dessen Sichtbarkeit erst im Browser entschieden
   wird, würde bei Abonnenten kurz aufblitzen.
4. **Der Gast-Merker liegt in `sessionStorage`, nicht in `localStorage`.** §6.1 verlangt
   ausdrücklich „weg für diesen Besuch, beim nächsten wieder da". Der vorhandene
   `signup-marker.ts` (localStorage) bleibt davon unberührt — er merkt sich etwas
   anderes, nämlich eine erfolgte Eintragung.
5. **Die Event-Checkbox trägt bei Erfolg der Anmeldung ein, nicht davor.** Schlägt die
   Gastanmeldung fehl, darf keine Newsletter-Zeile zurückbleiben. Umgekehrt darf ein
   fehlgeschlagener Newsletter-Eintrag die Event-Anmeldung nicht kippen — der Aufruf
   steht in seinem eigenen `try/catch`.
6. **Das Scroll-Panel erscheint nur auf wirklich langen Seiten.** 50 % Scrolltiefe
   allein taugt nicht als Auslöser: Auf einer Seite, die kaum höher ist als das Fenster,
   sind 50 % nach zwei Handbewegungen erreicht, und das Panel ginge praktisch überall
   sofort auf — direkt über der Footer-Karte. Bedingung ist deshalb **beides**: Die Seite
   ist mindestens **dreimal so hoch wie das Fenster**, _und_ die Hälfte ist gescrollt.
   Bei drei Fensterhöhen liegen zum Auslösezeitpunkt noch anderthalb Fensterhöhen unter
   dem Betrachter — der Footer ist also außer Sicht, und die Leitentscheidung oben bleibt
   gewahrt. Der Faktor drei ist eine Setzung und steht als benannte Konstante, damit man
   ihn ohne Suchen ändern kann.

7. **Kein neues Design-Token.** Alle Flächen verwenden `variant="plain"`, die in
   `NewsletterSignupForm` seit PR 3 wartet. Der Blickfang (H1, Markenrot) bleibt dem
   Footer und `/newsletter` vorbehalten — mehrere rote Flächen auf einer Seite wären
   keine Betonung mehr.

## Global Constraints

- **Feature-Flag `newsletter`.** Jede Fläche sitzt in einer fremden Seite und fragt
  daher `newsletterEnabled()` und rendert `null` — **nie** `requireNewsletterFlag()`.
  Ein `notFound()` im Blogartikel nähme den Artikel mit.
- **Regel 1:** Nur `modules/newsletter` liest oder schreibt `newsletter_*`.
- **§6 rechtlich verbindlich:** Checkbox nie vorausgewählt, Einwilligung nie an eine
  andere Handlung gekoppelt (Event-Anmeldung funktioniert vollständig ohne sie), neben
  jedem Formular ein Verweis auf `/datenschutz`.
- **Identische Antwort nach außen** (§8 Nr. 4) — gilt auch hier, `subscribePubliclyAction`
  bringt sie schon mit.
- Deutsch, Duzen, Tonalität F2. Kommentare und Bezeichner englisch.
- Design-Token statt Inline-Werten (CLAUDE.md §7).
- Tests im selben PR. Integrationstests gegen Docker-Postgres.
- **Vor dem E2E-Lauf `lsof -i :3000` prüfen** und die volle Suite laufen lassen, nicht
  nur die eigene Spec — der Fehlschluss aus PR 3.

## Dateistruktur

| Datei                                            | Verantwortung                             |
| ------------------------------------------------ | ----------------------------------------- |
| `app/_newsletter/viewer-state.ts`                | **neu** — Typ + Server-Leser des Zustands |
| `app/_newsletter/NewsletterOffer.tsx`            | **neu** — die Matrix, präsentational      |
| `app/_newsletter/NewsletterOneClick.tsx`         | **neu** — Ein-Klick-Knopf für Eingeloggte |
| `app/_newsletter/NewsletterOffer.test.tsx`       | **neu** — die Matrix, vier Fälle          |
| `app/_newsletter/dismiss-marker.ts`              | **neu** — `sessionStorage`, Gast-Wegklick |
| `app/_newsletter/NewsletterScrollPanel.tsx`      | **neu** — D2, 50 % Scrolltiefe            |
| `app/_newsletter/NewsletterScrollPanel.test.tsx` | **neu**                                   |
| `app/_content/puck-config.tsx`                   | Block „Newsletter-Anmeldung"              |
| `app/_content/canvas-chrome.ts`                  | Betrachterzustand in die Leinwand         |
| `app/events/[id]/GuestRegisterForm.tsx`          | Checkbox                                  |
| `app/events/[id]/actions.ts`                     | Eintragung nach erfolgreicher Anmeldung   |
| `e2e/newsletter-flaechen.e2e.ts`                 | **neu** — Abnahme                         |

---

### Task 1: Betrachterzustand und `NewsletterOffer`

**Files:** `app/_newsletter/viewer-state.ts`, `NewsletterOffer.tsx`,
`NewsletterOneClick.tsx`, `NewsletterOffer.test.tsx`

**Produces:** `type NewsletterViewerState = "guest" | "member" | "done" | "off"`;
`readNewsletterViewerState(db, session)`; `<NewsletterOffer state source sourcePath />`

- [ ] **Schritt 1: Failing test** — die vier Fälle: `guest` → Eingabefeld; `member` →
      Ein-Klick-Knopf; `done` → `null`; `off` → `null`. `NewsletterSignupForm` wird
      gestubbt (PR-3-Lehre: `useFormState` rendert nicht ohne Action-Kontext).
- [ ] **Schritt 2:** `viewer-state.ts` — Server. Flag aus, oder Abo vorhanden bzw.
      `declined` → der Zustand sagt „nichts zeigen". Kein Datenbankzugriff bei
      ausgeloggten Besuchern.
- [ ] **Schritt 3:** `NewsletterOneClick.tsx` — Client, `useFormState` auf
      `subscribeMeAction`, Erfolgstext wortgleich zu §13.2.
- [ ] **Schritt 4:** `NewsletterOffer.tsx` — präsentational, entscheidet allein aus dem
      `state`-Prop. Kein eigener Datenzugriff, damit sie auch im Puck-Client-Baum läuft.
- [ ] **Schritt 5:** `pnpm vitest run apps/web/app/_newsletter && pnpm typecheck && pnpm lint`
- [ ] **Schritt 6: Commit** — `feat(newsletter): one place that decides what a surface shows`

### Task 2: Puck-Block „Newsletter-Anmeldung"

**Files:** `app/_content/puck-config.tsx`, `app/_content/canvas-chrome.ts`

- [ ] **Schritt 1: Typdeklaration prüfen, nicht annehmen.** In
      `node_modules/.pnpm/@puckeditor+core@0.23.0*/…/dist/*.d.ts` nachsehen, wie
      `metadata` an `<Puck>` und `<Render>` übergeben und in einer Komponente gelesen
      wird. **Wenn der Weg nicht existiert:** Block rendert für alle die öffentliche
      Variante, und das wird hier vermerkt — nicht still abweichen.
- [ ] **Schritt 2:** `CanvasChrome` um `newsletter: { enabled: boolean; state: "guest" | "member" | "done" | "editor" }`
      erweitern.
- [ ] **Schritt 3:** Block registrieren. Im Editor **fest** „editor" → inerte Vorschau,
      wie `showNewsletter={false}` es beim Footer tut.
- [ ] **Schritt 4:** Tests für `puck-config` ergänzen (Muster: vorhandene Blocktests).
- [ ] **Schritt 5: Commit** — `feat(newsletter): a Puck block the board can place anywhere`

### Task 3: Scroll-Panel (D2)

**Files:** `app/_newsletter/dismiss-marker.ts`, `NewsletterScrollPanel.tsx`, Test,
Einbau im öffentlichen Layout

Die aufwendigste Aufgabe. **Wenn sie größer wird als erwartet, ist sie der natürliche
Schnitt für einen eigenen PR** — die anderen drei Flächen stehen dann schon.

- [ ] **Schritt 1:** `dismiss-marker.ts` — `sessionStorage`, jeder Zugriff in `try/catch`
      (wie `signup-marker.ts`).
- [ ] **Schritt 2: Failing test** — erscheint **nie** auf einer Seite unter drei
      Fensterhöhen, egal wie weit gescrollt wird; auf einer langen Seite nicht vor
      50 %; danach schon; nach Wegklicken für die Sitzung weg; nie, wenn der Server
      es verbietet.
- [ ] **Schritt 3:** Panel bauen. Server entscheidet _ob_, Client _wann_
      (Entscheidung 3). Auslöser ist `MIN_PAGE_HEIGHT_FACTOR = 3` **und** 50 %
      Scrolltiefe (Entscheidung 6); beide als benannte Konstanten. `motion-safe:`
      für das Einblenden.
- [ ] **Schritt 4:** Wegklicken ruft für Eingeloggte `dismissPromptAction` (14 Tage,
      Deckel bei drei — beides steckt schon in `declineForUser`), für Gäste nur den
      Sitzungs-Merker.
- [ ] **Schritt 5:** Einbau im öffentlichen Layout, Flag-geprüft.
- [ ] **Schritt 6: Commit** — `feat(newsletter): the scroll panel, and what "not now" means`

### Task 4: Checkbox in der Event-Gastanmeldung

**Files:** `app/events/[id]/GuestRegisterForm.tsx`, `app/events/[id]/actions.ts`

- [ ] **Schritt 1: Failing test** — Anmeldung ohne Häkchen trägt **nicht** ein;
      Anmeldung mit Häkchen trägt ein; ein Fehler beim Eintragen kippt die
      Event-Anmeldung **nicht** (Entscheidung 5).
- [ ] **Schritt 2:** Checkbox, ungehakt, nicht `required`, mit `/datenschutz`-Verweis.
- [ ] **Schritt 3:** In der Action **nach** erfolgreicher Anmeldung
      `subscribePublicly(source: "event_gast")` in eigenem `try/catch`.
- [ ] **Schritt 4:** Tests, Typecheck, Lint.
- [ ] **Schritt 5: Commit** — `feat(newsletter): an optional tick on the guest registration`

### Task 5: E2E und Abnahme

- [ ] **Schritt 1:** `e2e/newsletter-flaechen.e2e.ts` — Panel erscheint erst nach
      Scrollen und bleibt nach Wegklicken weg; auf einer kurzen Seite erscheint es nie; Gast-Häkchen
      erzeugt eine `pending`-Zeile; **ohne** Häkchen keine Zeile.
      `resetNewsletterRateLimits()` voranstellen (PR-3-Lehre).
- [ ] **Schritt 2: Volle Suite**, nicht nur die eigene Spec:
      `pnpm vitest run && pnpm typecheck && pnpm lint && pnpm format:check`, dann
      `pnpm --filter @bdas/web build && pnpm e2e`.
- [ ] **Schritt 3: Abnahme** — - Flag aus: keine der vier Flächen erscheint, keine Seite ist kaputt. - Im Puck-Editor rendert **kein** scharfes Feld. - Ein Abonnent sieht keine der Flächen. - Dreimal wegklicken → dauerhaft Ruhe, `status = declined`. - Event-Anmeldung funktioniert vollständig ohne Häkchen. - Kein Inline-Hex, -Radius, -Schatten, keine Inline-Dauer.
- [ ] **Schritt 4: Commit + PR**

---

## Was danach kommt

**PR 5 — Board-Ansicht** `/federal/newsletter`. **Vorbedingung:** ein Stapelleser
`getUserEmails(db, ids)` in `@bdas/auth`, sonst löst `listSubscribers` jede Zeile
einzeln auf.

**Nicht Teil dieses PRs, aber offen:** Der Versand selbst existiert nicht und hat keine
Spec. Dort gehört der Abmeldelink in die Fußzeile jeder Ausgabe.

# Newsletter PR 3 — Öffentliche Erfassung

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Newsletter wird öffentlich erfassbar — Eingabefeld im Footer und auf einer eigenen `/newsletter`-Seite, vollständiges Double-Opt-In per E-Mail, Bestätigungs- und Abmelderoute, Missbrauchsschutz, und der Datenschutzhinweis wird um den Zweck „Newsletter" ergänzt.

**Architecture:** `modules/newsletter` kann seit PR 1 alles, was fachlich nötig ist, und veröffentlicht `newsletter.confirmation_requested` und `newsletter.already_subscribed`. Bisher hört niemand zu. Dieser PR schließt den Kreis an drei Stellen: `modules/notifications` bekommt zwei Vorlagen und einen Bus-Handler (Richtung notifications → newsletter, nie umgekehrt), `modules/newsletter` bekommt die noch fehlende IP-Drosselung, und `apps/web` bekommt die öffentlichen Flächen und die zwei Token-Routen.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Components + Server Actions), Drizzle ORM auf PostgreSQL, vitest (Integrationstests gegen Docker-Postgres, keine DB-Mocks), Playwright für E2E, Tailwind + `@bdas/design-system`.

**Spec:** `docs/superpowers/specs/2026-09-06-newsletter-modul-design.md` (Branch `docs/newsletter-modul-spec`, **nicht auf `main`** — vor dem Start auschecken oder mergen). Der Plan argumentiert aus der Spec; beide zusammen lesen. Vorgänger: `docs/superpowers/plans/2026-09-07-newsletter-pr1-pr2.md`.

## Global Constraints

- **Feature-Flag:** `newsletter`. Jede eigene Route prüft mit `requireNewsletterFlag()`; eine Fläche, die in einer fremden Seite sitzt (der Footer!), fragt `newsletterEnabled()` und rendert `null`. Ein `notFound()` im Footer nähme jede öffentliche Seite mit.
- **Regel 1 (Tabellenbesitz):** Nur `modules/newsletter` liest oder schreibt `newsletter_*`. Die App-Schicht und `modules/notifications` rufen ausschließlich Services aus `@bdas/newsletter`.
- **Regel 3 (keine Zyklen):** `modules/notifications` importiert `@bdas/newsletter`. `modules/newsletter` importiert **niemals** `@bdas/notifications` — es veröffentlicht nur Ereignisse.
- **Bus-Handler dürfen nie werfen** (Spec §7). Jeder Handler ist in `safe()` gewickelt.
- **Identische Antwort nach außen** (Spec §8 Nr. 4, §13.2): neu, bereits eingetragen, abgemeldet und Kontoinhaber sind ununterscheidbar — im Text **und** in der Antwortzeit. Sonst verrät die Dauer, was der Text verschweigt, und das Formular wird zum Prüfwerkzeug für Zugehörigkeit im Sinne von Art. 9 DSGVO.
- **Kein nutzergesteuerter Inhalt in der Mail** (Spec §8 Nr. 3). Die Vorlage ist fest, nur der Bestätigungslink variiert.
- **Sprache:** Alle nutzersichtbaren Texte auf Deutsch, Duzen, Tonalität **F2** („einladend, wir"). Kommentare und Bezeichner im Code auf Englisch.
- **Design-Token (CLAUDE.md §7):** Kein inline-Hex, kein inline-Radius, kein inline-Schatten, keine inline-Dauer. Fehlt ein Wert, wird er in `core/design-system/src/tokens.ts` ergänzt **und** in `core/design-system/README.md` angemeldet.
- **`email` immer normalisiert:** `.trim().toLowerCase()` vor jedem Schreiben und jedem Nachschlagen.
- **Node ≥ 22.5**, `pnpm` als Paketmanager.
- **Tests im selben PR** wie der Code (CLAUDE.md §4). Integrationstests gegen echtes Postgres: `pnpm db:up` muss laufen.
- **`/security-review` ist für diesen PR Pflicht** (Spec §12 Nr. 3) — er nimmt zum ersten Mal Eingaben von anonymen Besuchern entgegen und löst daraus E-Mail-Versand aus.

## Entscheidungen, die dieser Plan über die Spec hinaus trifft

Die Spec verweist Detailfragen ausdrücklich in den Implementierungsplan (§13.4). Diese sieben sind hier entschieden:

1. **Bestätigen per GET, Abmelden per POST.** Postfach-Scanner (Outlook Safe Links, Virenfilter) rufen Links in E-Mails auf, bevor ein Mensch sie sieht. Für die Bestätigung ist das hinnehmbar: Der Scanner gehört zum Postfach des Adressinhabers, der Nachweis „jemand mit Zugang zu diesem Postfach hat den Link geöffnet" bleibt intakt, und ein Zwischenklick würde die Konversion kosten. Für die Abmeldung ist es das nicht — ein Scanner würde Menschen stillschweigend austragen, die nie abbestellen wollten. `/newsletter/abmelden?token=…` zeigt deshalb nur eine Seite mit einem Knopf; die Abmeldung passiert in einer Server Action. Die Asymmetrie ist Absicht: versehentlich eingetragen ist ärgerlich und in einem Klick behoben, versehentlich ausgetragen merkt niemand.
2. **Die Newsletter-Mails haben keine namentliche Anrede.** `sendTransactionalToGuest` setzt sonst „Hallo Gast" — bei einer Adresse, von der wir nur die Adresse kennen, ist das schlechter als gar keine Anrede. `templates.ts` bekommt dafür eine zweite Rumpf-Funktion `plainBody()` ohne Namenszeile.
3. **Die IP-Drosselung gehört ins Modul, nicht in die Server Action.** Sie zählt in `newsletter_rate_limits`, und diese Tabelle gehört `modules/newsletter` (Regel 1). `subscribePublicly` bekommt den Deckel direkt eingebaut, damit kein Aufrufer ihn vergessen kann.
4. **Der Honeypot wirft nicht, er tut nur nichts.** Ein Bot, der eine Fehlermeldung bekommt, lernt daraus. Ein Bot, der dieselbe freundliche Antwort bekommt wie ein Mensch, lernt nichts — und die identische Antwort ist ohnehin schon die Regel (§8 Nr. 4).
5. **A3 bekommt den H1-Blickfang, nicht den Akzentbalken.** Der Musterbogen zeichnet A3 mit rotem Akzentbalken (`accent-rail`), §13.1 der Spec hat den aber gestrichen und durch den Blickfang aus §13.3 ersetzt. Die Spec gewinnt: A3 ist die abgesetzte Karte über der Fußzeile **in der H1-Gestalt**, also volle Fläche Markenrot mit weißem Knopf — dieselben Token, die PR 2 für C1 angemeldet hat.
6. **Ein Formular, zwei Einbauorte.** Footer (A3) und `/newsletter` zeigen dasselbe Eingabefeld mit denselben vier Zuständen. Das ist eine Komponente mit einer `variant`-Prop, keine zwei Kopien — sonst driften die Texte auseinander, und §13.2 verlangt sie wortgleich.
7. **Der Merker nach anonymer Eintragung liegt in `localStorage`.** §6 verlangt „Ruhe nach der Eintragung" auch für Ausgeloggte. Serverseitig ginge das nur über ein Cookie, das ohne Einwilligung heikel wäre; `localStorage` ist hier ein reiner Anzeige-Komfort und darf leer zurückkommen, ohne dass etwas kaputtgeht. Jeder Zugriff steht in `try/catch`.

## Dateistruktur

**`modules/notifications/`**

| Datei                                | Verantwortung                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `src/types.ts`                       | zwei neue `TransactionalTemplate`-Werte, `confirmUrl`/`unsubscribeUrl` in `TemplateData` |
| `src/templates.ts`                   | die zwei deutschen Vorlagen + `plainBody()` ohne Anrede                                  |
| `src/templates.test.ts`              | Text- und Link-Prüfungen für beide Vorlagen                                              |
| `src/subscribers.ts`                 | zwei neue Handler, in `safe()` gewickelt                                                 |
| `src/subscribers.newsletter.test.ts` | Handler-Test gegen echtes Postgres                                                       |
| `package.json`                       | Abhängigkeit `@bdas/newsletter`                                                          |

**`modules/newsletter/`**

| Datei                                   | Verantwortung                               |
| --------------------------------------- | ------------------------------------------- |
| `src/services/subscribe.ts`             | IP-Deckel in `subscribePublicly`            |
| `src/services/subscribe-public.test.ts` | Test für den IP-Deckel                      |
| `src/services/confirm.ts`               | `peekUnsubscribeToken` für die Abmeldeseite |
| `src/services/confirm.test.ts`          | Test dafür                                  |
| `src/index.ts`                          | `peekUnsubscribeToken` re-exportieren       |
| `src/index.test.ts`                     | Oberflächentest um den neuen Namen ergänzen |
| `README.md`                             | Abschnitt „Öffentliche Erfassung" ergänzen  |

**`apps/web/`**

| Datei                                            | Verantwortung                                           |
| ------------------------------------------------ | ------------------------------------------------------- |
| `app/_newsletter/public-actions.ts`              | Server Action für die öffentliche Eintragung + Honeypot |
| `app/_newsletter/NewsletterSignupForm.tsx`       | Das Eingabefeld, vier Zustände, zwei Varianten          |
| `app/_newsletter/signup-marker.ts`               | `localStorage`-Merker, gekapselt und fehlertolerant     |
| `app/_public/PublicFooterView.tsx`               | A3 — Karte über der Fußzeile                            |
| `app/_public/PublicFooter.tsx`                   | Flag-Lesung durchreichen                                |
| `app/_content/puck-config.tsx`                   | im Editor-Canvas fest `showNewsletter={false}`          |
| `app/newsletter/page.tsx`                        | Die eigene Seite                                        |
| `app/newsletter/bestaetigen/page.tsx`            | Bestätigungsroute (GET wirkt)                           |
| `app/newsletter/abmelden/page.tsx`               | Abmelderoute (GET zeigt, POST wirkt)                    |
| `app/newsletter/abmelden/UnsubscribeConfirm.tsx` | Der Knopf mit seinen Zuständen                          |
| `app/newsletter/abmelden/actions.ts`             | Server Action zum Abmelden                              |
| `e2e/newsletter-public.e2e.ts`                   | Abnahme für den öffentlichen Weg                        |

**`docs/datenschutz/`**

| Datei                               | Verantwortung                                                        |
| ----------------------------------- | -------------------------------------------------------------------- |
| `newsletter-textbaustein.md`        | Der Abschnitt zum Einpflegen — `/datenschutz` liegt in der Datenbank |
| `datenschutz-bestandsaufnahme.html` | Verarbeitungszweck „Newsletter" fortschreiben                        |

---

### Task 1: Die zwei E-Mail-Vorlagen

**Files:**

- Modify: `modules/notifications/src/types.ts`
- Modify: `modules/notifications/src/templates.ts`
- Modify: `modules/notifications/src/templates.test.ts`

**Interfaces:**

- Consumes: `TransactionalTemplate`, `TemplateData`, `RenderedEmail` aus dem bestehenden notifications-Modul.
- Produces: die Vorlagen-Werte `"newsletter_confirm"` und `"newsletter_already_subscribed"`; die Felder `confirmUrl` und `unsubscribeUrl` in `TemplateData`; die private Hilfsfunktion `plainBody()`.

Beide Mails gehen an eine Adresse, von der wir **nur die Adresse** kennen — kein Name, kein Konto. Deshalb `plainBody()` statt `body()`: keine Anrede, sondern ein direkter Einstieg. Die Tonalität ist F2, dieselbe wie auf den Flächen.

- [x] **Step 1: Failing test schreiben**

An `modules/notifications/src/templates.test.ts` anfügen:

```ts
describe("newsletter templates", () => {
  it("renders the confirmation mail with the link and no salutation", () => {
    const mail = render("newsletter_confirm", {
      firstName: "",
      eventTitle: "",
      confirmUrl: "https://bdas.de/newsletter/bestaetigen?token=abc",
    });

    expect(mail.subject).toBe("BDAS — Bitte bestätige deine Anmeldung");
    // An anonymous signup has no name, so the salutation stays nameless —
    // "Hallo Gast" (what sendTransactionalToGuest would default to) reads worse
    // than no name at all.
    expect(mail.text).toContain("Hallo,");
    expect(mail.text).not.toContain("Hallo Gast");
    expect(mail.text).toContain("https://bdas.de/newsletter/bestaetigen?token=abc");
    expect(mail.html).toContain("https://bdas.de/newsletter/bestaetigen?token=abc");
    // Seven days is the token lifetime from spec §4 — say so in the mail.
    expect(mail.text).toContain("sieben Tage");
  });

  it("renders the already-subscribed mail with the unsubscribe link", () => {
    const mail = render("newsletter_already_subscribed", {
      firstName: "",
      eventTitle: "",
      unsubscribeUrl: "https://bdas.de/newsletter/abmelden?token=xyz",
    });

    expect(mail.subject).toBe("BDAS — Du bist schon dabei");
    expect(mail.text).not.toContain("Hallo Gast");
    expect(mail.text).toContain("https://bdas.de/newsletter/abmelden?token=xyz");
  });

  it("escapes a hostile url instead of letting it into the markup", () => {
    const mail = render("newsletter_confirm", {
      firstName: "",
      eventTitle: "",
      confirmUrl: 'https://bdas.de/x?a="><script>alert(1)</script>',
    });
    expect(mail.html).not.toContain("<script>");
  });
});
```

- [x] **Step 2: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run modules/notifications/src/templates.test.ts`
Expected: FAIL — `"newsletter_confirm"` ist kein gültiger `TransactionalTemplate`.

- [x] **Step 3: Typen erweitern**

`modules/notifications/src/types.ts` — die Union um zwei Werte ergänzen:

```ts
  | "blog_post_reported"
  | "newsletter_confirm"
  | "newsletter_already_subscribed";
```

und `TemplateData` um zwei Felder erweitern (direkt nach `reportReason`):

```ts
  /** `newsletter_confirm`: the double-opt-in link. The only part of the mail
   *  that varies — spec §8 no. 3 keeps everything else fixed. */
  readonly confirmUrl?: string | undefined;
  /** `newsletter_already_subscribed`: the permanent unsubscribe link. */
  readonly unsubscribeUrl?: string | undefined;
```

- [x] **Step 4: Vorlagen schreiben**

`modules/notifications/src/templates.ts` — in `render()` die Destrukturierung oben erweitern:

```ts
const { firstName, eventTitle, eventUrl, postTitle, postUrl, reportReason } = data;
const { confirmUrl, unsubscribeUrl } = data;
```

und vor dem `default`-Zweig des `switch` zwei Fälle einfügen:

```ts
    case "newsletter_confirm":
      return plainBody(
        "BDAS — Bitte bestätige deine Anmeldung",
        "schön, dass du dabei sein willst. Bestätige einmal kurz, dass diese Adresse dir gehört — dann bekommst du ein paar Mal im Jahr Neues aus dem Verband und den Hochschulgruppen.",
        confirmUrl ? { label: "Anmeldung bestätigen:", url: confirmUrl } : undefined,
        "Der Link gilt sieben Tage. Wenn du dich nicht angemeldet hast, ignoriere diese E-Mail einfach — ohne Bestätigung passiert nichts.",
      );
    case "newsletter_already_subscribed":
      return plainBody(
        "BDAS — Du bist schon dabei",
        "jemand hat diese Adresse gerade für unseren Newsletter eingetragen. Du stehst schon auf der Liste, deshalb ändert sich nichts und du bekommst nichts doppelt.",
        unsubscribeUrl ? { label: "Wenn du nicht mehr dabei sein willst:", url: unsubscribeUrl } : undefined,
      );
```

Am Dateiende neben `body()` die zweite Rumpf-Funktion ergänzen:

```ts
/**
 * A transactional body WITHOUT a salutation. The newsletter mails go to an
 * address we know nothing else about — no member row, no name. `body()` would
 * render "Hallo Gast", which reads worse than simply starting with the
 * sentence. The leading lowercase in the copy is deliberate: the subject line
 * carries the greeting.
 */
function plainBody(
  subject: string,
  line: string,
  action?: { label: string; url: string },
  footnote?: string,
): RenderedEmail {
  const actionText = action ? `\n\n${action.label}\n${action.url}` : "";
  const footText = footnote ? `\n\n${footnote}` : "";
  const text = `Hallo,\n\n${line}${actionText}${footText}\n\nViele Grüße\nDein BDAS-Team\n`;
  const actionHtml = action
    ? `<p>${escapeHtml(action.label)}<br><a href="${escapeHtml(action.url)}">${escapeHtml(action.url)}</a></p>`
    : "";
  const footHtml = footnote ? `<p>${escapeHtml(footnote)}</p>` : "";
  const html =
    `<p>Hallo,</p>` +
    `<p>${escapeHtml(line)}</p>` +
    actionHtml +
    footHtml +
    `<p>Viele Grüße<br>Dein BDAS-Team</p>`;
  return { subject, text, html };
}
```

- [x] **Step 5: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run modules/notifications/src/templates.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add modules/notifications/src/types.ts modules/notifications/src/templates.ts modules/notifications/src/templates.test.ts
git commit -m "feat(notifications): newsletter confirmation and already-subscribed templates"
```

---

### Task 2: Der Bus-Handler in notifications

**Files:**

- Modify: `modules/notifications/package.json`
- Modify: `modules/notifications/src/subscribers.ts`
- Create: `modules/notifications/src/subscribers.newsletter.test.ts`

**Interfaces:**

- Consumes: `AlreadySubscribed`, `ConfirmationRequested`, `UNSUBSCRIBE_PATH` aus `@bdas/newsletter`; `sendTransactionalToGuest` (modul-intern).
- Produces: zwei zusätzliche Abonnements in `registerNewsletterSubscribers`… **nein** — in `registerNotificationSubscribers`. Der Name bleibt unverändert; es kommen nur zwei `bus.subscribe`-Aufrufe dazu.

**Warum hier und nicht im Newsletter-Modul.** `modules/newsletter` darf keine Mail versenden (Spec §2) und importiert `@bdas/notifications` nicht. Die Richtung ist notifications → newsletter: notifications kennt die Ereignistypen und die Vorlagen, newsletter kennt nur den Bus. Damit bleibt Regel 3 gewahrt.

**Das Abmelde-Token in der `already_subscribed`-Mail.** Das Ereignis trägt es nicht — und das ist richtig so, denn es wird für Adressen veröffentlicht, deren Zeile der Publisher gar nicht anfassen soll. Der Handler baut den Link deshalb **nicht** aus einem Token, sondern zeigt auf `/newsletter/abmelden` ohne Parameter; die Seite fragt dort nach der Adresse. Ein Token an dieser Stelle wäre ein Abmeldeschlüssel in einer Mail, die jemand ausgelöst hat, der die Adresse nur eingetippt hat.

- [x] **Step 1: Abhängigkeit ergänzen**

`modules/notifications/package.json` — in `dependencies`, alphabetisch vor `@bdas/storage` bzw. an die passende Stelle:

```json
    "@bdas/newsletter": "workspace:*",
```

Danach `pnpm install` ausführen.

- [x] **Step 2: Failing test schreiben**

`modules/notifications/src/subscribers.newsletter.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import { setNotifier, type OutboundEmail } from "./notifier";
import { registerNotificationSubscribers } from "./subscribers";
import { dbReachable, setupNotificationsDb } from "./test-db";

const reachable = await dbReachable();

describe.skipIf(!reachable)("newsletter bus handlers", () => {
  let t: TestDb;
  let sent: OutboundEmail[];

  beforeEach(async () => {
    t = await setupNotificationsDb();
    resetEventBus();
    sent = [];
    setNotifier({
      async send(mail) {
        sent.push(mail);
      },
    });
    registerNotificationSubscribers(t.db);
  });
  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("sends the confirmation mail with the url from the event", async () => {
    await getEventBus().publish({
      type: "newsletter.confirmation_requested",
      email: "neu@example.org",
      token: "plain-token",
      confirmUrl: "https://bdas.de/newsletter/bestaetigen?token=plain-token",
      at: new Date(),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("neu@example.org");
    expect(sent[0]!.subject).toBe("BDAS — Bitte bestätige deine Anmeldung");
    expect(sent[0]!.text).toContain("https://bdas.de/newsletter/bestaetigen?token=plain-token");
  });

  it("sends the already-subscribed mail without any token in the link", async () => {
    await getEventBus().publish({
      type: "newsletter.already_subscribed",
      email: "schon@example.org",
      at: new Date(),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("BDAS — Du bist schon dabei");
    expect(sent[0]!.text).toContain("/newsletter/abmelden");
    // The event carries no token, and inventing one here would hand an
    // unsubscribe key to whoever typed the address.
    expect(sent[0]!.text).not.toContain("token=");
  });

  it("never lets a send failure escape into the publisher", async () => {
    setNotifier({
      async send() {
        throw new Error("resend is down");
      },
    });

    await expect(
      getEventBus().publish({
        type: "newsletter.confirmation_requested",
        email: "kaputt@example.org",
        token: "t",
        confirmUrl: "https://bdas.de/newsletter/bestaetigen?token=t",
        at: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});
```

- [x] **Step 3: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run modules/notifications/src/subscribers.newsletter.test.ts`
Expected: FAIL — es wird nichts versendet, `sent` bleibt leer.

- [x] **Step 4: Handler schreiben**

`modules/notifications/src/subscribers.ts` — bei den übrigen Modul-Importen ergänzen:

```ts
import {
  UNSUBSCRIBE_PATH,
  type AlreadySubscribed,
  type ConfirmationRequested,
} from "@bdas/newsletter";
```

und in `registerNotificationSubscribers(db)` bei den anderen `subs.push(...)`-Aufrufen anfügen:

```ts
// Newsletter (spec §3.2). The newsletter module never sends mail itself; it
// publishes and this module renders. Direction is notifications → newsletter,
// so no cycle (rule 3).
subs.push(
  bus.subscribe<ConfirmationRequested>(
    "newsletter.confirmation_requested",
    safe<ConfirmationRequested>(async (e) => {
      await sendTransactionalToGuest(
        db,
        "newsletter_confirm",
        { email: e.email },
        { confirmUrl: e.confirmUrl },
      );
    }),
  ),
);
subs.push(
  bus.subscribe<AlreadySubscribed>(
    "newsletter.already_subscribed",
    safe<AlreadySubscribed>(async (e) => {
      // No token: this mail is triggered by whoever typed the address, and a
      // token here would hand them an unsubscribe key for someone else's
      // subscription. The page asks for the address instead.
      const base = (process.env["PUBLIC_SITE_URL"] ?? "").replace(/\/$/, "");
      await sendTransactionalToGuest(
        db,
        "newsletter_already_subscribed",
        { email: e.email },
        { unsubscribeUrl: `${base}${UNSUBSCRIBE_PATH}` },
      );
    }),
  ),
);
```

- [x] **Step 5: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run modules/notifications/src/subscribers.newsletter.test.ts`
Expected: PASS (3 Tests)

- [x] **Step 6: Commit**

```bash
git add modules/notifications package.json pnpm-lock.yaml
git commit -m "feat(notifications): send the newsletter confirmation and already-subscribed mails"
```

---

### Task 3: Die fehlende IP-Drosselung

**Files:**

- Modify: `modules/newsletter/src/services/subscribe.ts`
- Modify: `modules/newsletter/src/services/subscribe-public.test.ts`

**Interfaces:**

- Consumes: `tryRateLimit` aus `../rate-limit` (bereits importiert).
- Produces: keine neue Signatur — `subscribePublicly` verhält sich nur strenger.

Spec §8 Nr. 1 verlangt zwei Deckel: **je Adresse** (1 Mail pro 15 Minuten, 3 pro Tag — steht seit PR 1) und **je IP** (5 Eintragungen pro Stunde — fehlt). Der IP-Deckel ist der wichtigere von beiden: Der Adress-Deckel schützt ein einzelnes fremdes Postfach, der IP-Deckel schützt gegen jemanden, der tausend verschiedene Adressen durchprobiert.

**Der IP-Deckel unterdrückt nicht nur die Mail, er lehnt die Eintragung ab.** Das ist der Unterschied zum Adress-Deckel. Wer die Adresse eines anderen zum zweiten Mal einträgt, soll keine zweite Mail auslösen — die Zeile darf trotzdem entstehen. Wer aber von einer IP aus die sechste Adresse in einer Stunde einträgt, hat nichts Gutes vor, und dann soll auch keine Zeile entstehen. Nach außen bleibt die Antwort trotzdem identisch (§8 Nr. 4): Der Aufrufer bekommt `void`, kein Fehler.

- [x] **Step 1: Failing test schreiben**

An `modules/newsletter/src/services/subscribe-public.test.ts` innerhalb des bestehenden `describe`-Blocks anfügen:

```ts
it("stops the sixth signup from one IP within the hour, silently", async () => {
  const ctx = { ip: "203.0.113.55" };
  for (let i = 1; i <= 5; i += 1) {
    await subscribePublicly(t.db, {
      email: `mensch${i}@example.org`,
      source: "footer",
      context: ctx,
    });
  }
  expect(await rows()).toHaveLength(5);

  // The sixth is refused — but the caller cannot tell (spec §8 no. 4).
  await expect(
    subscribePublicly(t.db, { email: "mensch6@example.org", source: "footer", context: ctx }),
  ).resolves.toBeUndefined();
  expect(await rows()).toHaveLength(5);
});

it("counts the IP cap per address-independent window, not per address", async () => {
  // Five different addresses from one IP exhaust the budget even though each
  // address is seen for the first time.
  for (let i = 1; i <= 5; i += 1) {
    await subscribePublicly(t.db, {
      email: `a${i}@example.org`,
      source: "footer",
      context: { ip: "203.0.113.99" },
    });
  }
  await subscribePublicly(t.db, {
    email: "a6@example.org",
    source: "footer",
    context: { ip: "203.0.113.99" },
  });
  expect(await rows()).toHaveLength(5);

  // A different IP is unaffected.
  await subscribePublicly(t.db, {
    email: "anders@example.org",
    source: "footer",
    context: { ip: "198.51.100.1" },
  });
  expect(await rows()).toHaveLength(6);
});

it("does not apply the IP cap when no IP is known", async () => {
  // A server-side caller may have no IP at all; refusing everything then
  // would break the path rather than protect it.
  for (let i = 1; i <= 7; i += 1) {
    await subscribePublicly(t.db, { email: `ohne${i}@example.org`, source: "footer" });
  }
  expect(await rows()).toHaveLength(7);
});
```

- [x] **Step 2: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run modules/newsletter/src/services/subscribe-public.test.ts`
Expected: FAIL — die sechste Zeile entsteht, `rows()` hat 6 statt 5 Einträge.

- [x] **Step 3: Deckel einbauen**

`modules/newsletter/src/services/subscribe.ts` — bei den Konstanten oben ergänzen:

```ts
/** At most 5 signups per IP per hour (spec §8 no. 1). Unlike the per-address
 *  cap this one refuses the signup outright: one address entered twice is a
 *  human being impatient, five hundred addresses from one IP is not. */
const IP_LIMIT = 5;
const IP_WINDOW_MS = 60 * 60 * 1000;
```

und in `subscribePublicly`, direkt nach der E-Mail-Prüfung und **vor** dem Nachschlagen der Zeile:

```ts
// Before anything is read or written: a refused attempt must not even reveal
// how long a lookup takes. Skipped when no IP is known — a server-side caller
// has none, and refusing those would break the path rather than protect it.
const ip = input.context?.ip?.trim();
if (ip) {
  const withinIpBudget = await tryRateLimit(db, {
    key: `nl:ip:${ip}`,
    limit: IP_LIMIT,
    windowMs: IP_WINDOW_MS,
  });
  // Identical answer either way (spec §8 no. 4): void, no error, no hint.
  if (!withinIpBudget) return;
}
```

- [x] **Step 4: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run modules/newsletter/src/services/subscribe-public.test.ts`
Expected: PASS (9 Tests)

- [x] **Step 5: Commit**

```bash
git add modules/newsletter/src/services/subscribe.ts modules/newsletter/src/services/subscribe-public.test.ts
git commit -m "feat(newsletter): cap public signups at five per IP per hour"
```

---

### Task 4: `peekUnsubscribeToken` für die Abmeldeseite

**Files:**

- Modify: `modules/newsletter/src/services/confirm.ts`
- Modify: `modules/newsletter/src/services/confirm.test.ts`
- Modify: `modules/newsletter/src/index.ts`
- Modify: `modules/newsletter/src/index.test.ts`

**Interfaces:**

- Produces: `peekUnsubscribeToken(db, token): Promise<{ readonly email: string; readonly alreadyUnsubscribed: boolean } | null>`

Die Abmeldeseite muss **vor** dem Abmelden wissen, ob der Link überhaupt gilt und welche Adresse dahintersteht — sonst kann sie weder „Willst du dich wirklich abmelden?" fragen noch die Adresse nennen. `unsubscribeByToken` taugt dafür nicht: Es meldet ab. Ein reines Lesen gehört daneben.

Die Funktion gibt **nur** die Adresse und den Status zurück, nie die ganze Zeile: Wer den Abmeldelink hat, soll sich abmelden können und sonst nichts erfahren.

- [x] **Step 1: Failing test schreiben**

An `modules/newsletter/src/services/confirm.test.ts` innerhalb des bestehenden `describe`-Blocks anfügen:

```ts
it("peeks at a valid unsubscribe token without changing anything", async () => {
  await seedPending();
  await confirmSubscription(t.db, "conf");

  const peek = await peekUnsubscribeToken(t.db, "unsub");
  expect(peek).toEqual({ email: "a@example.org", alreadyUnsubscribed: false });

  // Nothing changed — peeking is not unsubscribing.
  const [row] = await t.client.unsafe(`SELECT status FROM newsletter_subscribers`);
  expect(row!["status"]).toBe("subscribed");
});

it("reports an already-unsubscribed row so the page can say so", async () => {
  await seedPending();
  await confirmSubscription(t.db, "conf");
  await unsubscribeByToken(t.db, "unsub");

  expect(await peekUnsubscribeToken(t.db, "unsub")).toEqual({
    email: "a@example.org",
    alreadyUnsubscribed: true,
  });
});

it("returns null for an unknown token", async () => {
  expect(await peekUnsubscribeToken(t.db, "gibtsnicht")).toBeNull();
});
```

Den Import oben in derselben Datei erweitern:

```ts
import {
  confirmSubscription,
  peekUnsubscribeToken,
  unsubscribeAsUser,
  unsubscribeByToken,
} from "./confirm";
```

- [x] **Step 2: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run modules/newsletter/src/services/confirm.test.ts`
Expected: FAIL — `peekUnsubscribeToken` ist kein Export von `./confirm`.

- [x] **Step 3: Implementierung schreiben**

`modules/newsletter/src/services/confirm.ts` — anfügen:

```ts
/**
 * Read-only lookup for the unsubscribe page (spec §3.4).
 *
 * The page must know whether the link is valid and which address it belongs to
 * BEFORE it offers the button — otherwise it can neither ask "really?" nor name
 * the address. `unsubscribeByToken` cannot answer that: it unsubscribes.
 *
 * Returns the address and nothing else. Whoever holds the link may unsubscribe;
 * that does not entitle them to the row.
 */
export async function peekUnsubscribeToken(
  db: Db,
  token: string,
): Promise<{ readonly email: string; readonly alreadyUnsubscribed: boolean } | null> {
  const [row] = await db
    .select({
      email: newsletterSubscribers.email,
      status: newsletterSubscribers.status,
    })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.unsubscribeTokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;
  return { email: row.email, alreadyUnsubscribed: row.status === "unsubscribed" };
}
```

- [x] **Step 4: Oberfläche erweitern**

`modules/newsletter/src/index.ts` — die confirm-Zeile ersetzen durch:

```ts
export {
  confirmSubscription,
  peekUnsubscribeToken,
  unsubscribeAsUser,
  unsubscribeByToken,
} from "./services/confirm";
```

`modules/newsletter/src/index.test.ts` — in der erwarteten Namensliste `"peekUnsubscribeToken"` ergänzen (die Liste wird sortiert verglichen, die Position im Quelltext ist egal).

- [x] **Step 5: Tests laufen lassen — sie müssen bestehen**

Run: `pnpm vitest run modules/newsletter`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add modules/newsletter/src
git commit -m "feat(newsletter): read-only peek at an unsubscribe token"
```

---

### Task 5: Server Action und Honeypot

**Files:**

- Create: `apps/web/app/_newsletter/public-actions.ts`
- Create: `apps/web/app/_newsletter/public-actions.test.ts`

**Interfaces:**

- Consumes: `subscribePublicly` (`@bdas/newsletter`), `newsletterEnabled` (`./flag`), `bootNewsletter` (`../../lib/newsletter-bootstrap`).
- Produces: `type PublicSignupState = { readonly ok?: boolean; readonly error?: string }`; `subscribePubliclyAction(prev, formData)`; `HONEYPOT_FIELD`.

**Der Honeypot.** Ein Feld, das für Menschen unsichtbar ist und das nur ein Bot ausfüllt, der stumpf jedes `<input>` befüllt. Es heißt bewusst nicht „honeypot", sondern `website` — ein Name, den ein Bot für echt hält. Ist es ausgefüllt, tut die Action **nichts** und antwortet trotzdem mit Erfolg (Entscheidung 4).

**Die Antwortzeit.** §13.2 verlangt, dass auch die Dauer nichts verrät. Der Honeypot-Pfad kehrt sofort zurück, der echte Pfad fragt die Datenbank — das ist messbar unterschiedlich. Deshalb wartet der Honeypot-Pfad, bis dieselbe Zeit vergangen ist, die ein echter Durchlauf typischerweise braucht. Das ist keine Kryptografie und muss nicht exakt sein; es genügt, den Unterschied unter das Rauschen einer Netzwerkverbindung zu drücken.

- [x] **Step 1: Failing test schreiben**

`apps/web/app/_newsletter/public-actions.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: () => ({ get: (k: string) => (k === "x-forwarded-for" ? "203.0.113.7" : null) }),
}));

const subscribePubliclyMock = vi.fn();
vi.mock("@bdas/newsletter", () => ({
  subscribePublicly: (...a: unknown[]) => subscribePubliclyMock(...a),
}));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("../../lib/newsletter-bootstrap", () => ({ bootNewsletter: () => {} }));

import { HONEYPOT_FIELD, subscribePubliclyAction } from "./public-actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("subscribePubliclyAction", () => {
  beforeEach(() => {
    process.env["BDAS_FLAG_NEWSLETTER"] = "true";
    subscribePubliclyMock.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    delete process.env["BDAS_FLAG_NEWSLETTER"];
  });

  it("passes the address, the source and the client IP to the module", async () => {
    const state = await subscribePubliclyAction(
      {},
      form({ email: "Neu@Example.org", source: "footer", sourcePath: "/" }),
    );

    expect(state.ok).toBe(true);
    expect(subscribePubliclyMock).toHaveBeenCalledWith(expect.anything(), {
      email: "Neu@Example.org",
      source: "footer",
      sourcePath: "/",
      context: expect.objectContaining({ ip: "203.0.113.7" }),
    });
  });

  it("answers a filled honeypot exactly like a success, but writes nothing", async () => {
    const state = await subscribePubliclyAction(
      {},
      form({ email: "bot@example.org", source: "footer", [HONEYPOT_FIELD]: "http://spam.example" }),
    );

    expect(state.ok).toBe(true);
    expect(subscribePubliclyMock).not.toHaveBeenCalled();
  });

  it("reports an invalid address as a field error, not as success", async () => {
    const { ValidationError } = await import("@bdas/errors");
    subscribePubliclyMock.mockRejectedValue(
      new ValidationError("Bitte gib eine gültige E-Mail-Adresse an."),
    );

    const state = await subscribePubliclyAction(
      {},
      form({ email: "keine-adresse", source: "footer" }),
    );
    expect(state.ok).toBeUndefined();
    expect(state.error).toBe("Bitte gib eine gültige E-Mail-Adresse an.");
  });

  it("hides an internal failure behind the same success answer", async () => {
    subscribePubliclyMock.mockRejectedValue(new Error("db is down"));

    // A database hiccup must not tell a visitor anything about this address —
    // the identical-answer rule (spec §8 no. 4) outranks the error report here.
    const state = await subscribePubliclyAction(
      {},
      form({ email: "gut@example.org", source: "footer" }),
    );
    expect(state.ok).toBe(true);
  });

  it("does nothing at all while the flag is off", async () => {
    delete process.env["BDAS_FLAG_NEWSLETTER"];
    const state = await subscribePubliclyAction(
      {},
      form({ email: "x@example.org", source: "footer" }),
    );
    expect(state.ok).toBeUndefined();
    expect(subscribePubliclyMock).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run apps/web/app/_newsletter/public-actions.test.ts`
Expected: FAIL — `./public-actions` existiert nicht.

- [x] **Step 3: Implementierung schreiben**

`apps/web/app/_newsletter/public-actions.ts`:

```ts
"use server";

import { headers } from "next/headers";

import { getDb } from "@bdas/db";
import { ValidationError } from "@bdas/errors";
import { subscribePublicly, type NewsletterSource } from "@bdas/newsletter";

import { bootNewsletter } from "../../lib/newsletter-bootstrap";
import { newsletterEnabled } from "./flag";

export type PublicSignupState = { readonly ok?: boolean; readonly error?: string };

/**
 * A field that is invisible to people and irresistible to naive bots (spec §8
 * no. 2). Named like a real field on purpose — "honeypot" would give it away.
 */
export const HONEYPOT_FIELD = "website";

/**
 * How long a real run takes, roughly. The honeypot path returns without
 * touching the database, which would otherwise make it measurably faster than
 * a real signup — and §13.2 requires the DURATION to reveal as little as the
 * text. Not cryptography: enough to sink the difference below network noise.
 */
const DECOY_DELAY_MS = 120;

function consentContext() {
  const h = headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
    siteUrl: process.env["PUBLIC_SITE_URL"] ?? "",
  };
}

/**
 * Anonymous signup from a public surface. Answers identically whatever the
 * address turns out to be — new, known, unsubscribed or an account holder
 * (spec §8 no. 4). The only visible failure is a malformed address, because
 * that is the one case the visitor can actually fix.
 */
export async function subscribePubliclyAction(
  _prev: PublicSignupState,
  formData: FormData,
): Promise<PublicSignupState> {
  if (!newsletterEnabled()) return {};
  bootNewsletter();

  // Filled means bot. Same friendly answer as a human gets: an error would
  // teach the bot what tripped it.
  if (String(formData.get(HONEYPOT_FIELD) ?? "").trim() !== "") {
    await new Promise((resolve) => setTimeout(resolve, DECOY_DELAY_MS));
    return { ok: true };
  }

  const email = String(formData.get("email") ?? "");
  const source = String(formData.get("source") ?? "footer") as NewsletterSource;
  const sourcePath = String(formData.get("sourcePath") ?? "") || null;

  try {
    await subscribePublicly(getDb(), {
      email,
      source,
      sourcePath,
      context: consentContext(),
    });
  } catch (err) {
    // A malformed address is the visitor's to fix, so it is named. Anything
    // else is ours, and saying so would leak state about this address.
    if (err instanceof ValidationError) return { error: err.message };
    console.error("[newsletter] public signup failed:", err);
    return { ok: true };
  }

  return { ok: true };
}
```

- [x] **Step 4: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run apps/web/app/_newsletter/public-actions.test.ts`
Expected: PASS (5 Tests)

- [x] **Step 5: Commit**

```bash
git add apps/web/app/_newsletter/public-actions.ts apps/web/app/_newsletter/public-actions.test.ts
git commit -m "feat(newsletter): public signup action with honeypot and identical answers"
```

---

### Task 6: Das Eingabeformular

**Files:**

- Create: `apps/web/app/_newsletter/signup-marker.ts`
- Create: `apps/web/app/_newsletter/NewsletterSignupForm.tsx`

**Interfaces:**

- Consumes: `subscribePubliclyAction`, `HONEYPOT_FIELD`, `PublicSignupState` (`./public-actions`).
- Produces: `<NewsletterSignupForm source sourcePath variant />` mit `variant: "brand" | "plain"`; `markSignedUp()`, `hasSignedUp()`.

Ein Formular, zwei Einbauorte (Entscheidung 6). `variant="brand"` ist die H1-Gestalt für den Footer (A3) und die `/newsletter`-Seite; `variant="plain"` bleibt für spätere Flächen aus PR 4 vorhanden und wird hier schon mitgetestet, weil eine ungenutzte Variante billiger ist als ein zweites Formular später.

Die vier Zustände aus §13.2 stecken in dieser Komponente: Ruhe, „Wird eingetragen …", Erfolg, Fehler. Der Erfolgstext ist der wortgleiche aus §13.2 für den öffentlichen Fall.

- [x] **Step 1: Merker schreiben**

`apps/web/app/_newsletter/signup-marker.ts`:

```ts
/**
 * Remembers, in this browser only, that someone already signed up (spec §6,
 * "Ruhe nach der Eintragung"). Server-side this would need a cookie, which
 * would be a consent question of its own for what is purely a display comfort.
 *
 * Every access is wrapped: private windows, cleared site data and browsers
 * that block storage all throw here, and none of that is worth a broken page.
 */
const KEY = "bdas-newsletter-signed-up";

export function markSignedUp(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable — the surface simply keeps offering itself */
  }
}

export function hasSignedUp(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
```

- [x] **Step 2: Komponente schreiben**

`apps/web/app/_newsletter/NewsletterSignupForm.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Button, Input } from "@bdas/design-system";

import { HONEYPOT_FIELD, subscribePubliclyAction, type PublicSignupState } from "./public-actions";
import { hasSignedUp, markSignedUp } from "./signup-marker";

const initial: PublicSignupState = {};

function SubmitButton({ variant }: { variant: "brand" | "plain" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant === "brand" ? "on-brand" : "primary"} disabled={pending}>
      {pending ? "Wird eingetragen …" : "Ich bin dabei"}
    </Button>
  );
}

/**
 * The public signup field (spec §3.2). One component for every public surface
 * so the four states from §13.2 stay worded identically wherever they appear.
 *
 * `variant="brand"` is the H1 shape from §13.3 — the full brand-red field with
 * a white button, the same tokens PR 2 registered for C1.
 *
 * `hideOnPath` exists because the footer is on every public page, /newsletter
 * included — without it that page would carry the same form twice.
 */
export function NewsletterSignupForm({
  source,
  sourcePath,
  variant = "brand",
  heading = "Bleib in Verbindung",
  hideOnPath,
}: {
  source: string;
  sourcePath: string;
  variant?: "brand" | "plain";
  heading?: string;
  hideOnPath?: string;
}) {
  const [state, action] = useFormState(subscribePubliclyAction, initial);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const pathname = usePathname();
  // Ids must be unique per instance: two of these can share a page (the footer
  // one and a page one), and duplicate ids break every label/aria reference.
  const uid = useId();
  const headingId = `newsletter-heading-${uid}`;
  const emailId = `newsletter-email-${uid}`;
  const honeypotId = `newsletter-hp-${uid}`;

  // Read after mount: localStorage does not exist while rendering on the server,
  // and a mismatch between the two would be a hydration error.
  useEffect(() => {
    setAlreadyDone(hasSignedUp());
  }, []);

  useEffect(() => {
    if (state.ok) markSignedUp();
  }, [state.ok]);

  if (hideOnPath && pathname === hideOnPath) return null;
  if (alreadyDone && !state.ok) return null;

  const onBrand = variant === "brand";

  return (
    <section
      className={
        onBrand
          ? "rounded-bdas bg-bdas-red p-6 text-bdas-ink-on-brand shadow-bdas-card motion-safe:animate-bdas-fade-slide-up"
          : "rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-6"
      }
      aria-labelledby={headingId}
    >
      <h2
        id={headingId}
        className={onBrand ? "text-lg font-semibold" : "text-lg font-semibold text-bdas-ink"}
      >
        {heading}
      </h2>
      <p
        className={
          onBrand ? "mt-1 max-w-prose text-sm" : "mt-1 max-w-prose text-sm text-bdas-ink-body"
        }
      >
        Ein paar Mal im Jahr schreiben wir dir, was im Verband und in den Hochschulgruppen passiert.
      </p>

      <div aria-live="polite" className="mt-2 text-sm">
        {state.ok
          ? "Fast geschafft. Wir haben dir eine E-Mail geschickt. Bestätige darin einmal, dann bist du dabei."
          : null}
        {state.error ? <span className={onBrand ? "" : "text-bdas-red"}>{state.error}</span> : null}
      </div>

      {!state.ok ? (
        <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="sourcePath" value={sourcePath} />

          {/* Invisible to people, irresistible to naive bots (spec §8 no. 2).
              aria-hidden + tabIndex keep it away from assistive technology. The
              NAME is what the action reads; the id only ties the label to it. */}
          <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
            <label htmlFor={honeypotId}>Website</label>
            <input
              id={honeypotId}
              name={HONEYPOT_FIELD}
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <div className="grow" style={{ minWidth: "12rem" }}>
            <label htmlFor={emailId} className="sr-only">
              E-Mail-Adresse
            </label>
            <Input
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="deine@mail.de"
            />
          </div>
          <SubmitButton variant={variant} />
        </form>
      ) : null}

      <p className={onBrand ? "mt-3 text-xs opacity-80" : "mt-3 text-xs text-bdas-ink-muted"}>
        Abbestellen kannst du jederzeit. Wie wir mit deinen Daten umgehen, steht im{" "}
        <a href="/datenschutz" className="underline">
          Datenschutzhinweis
        </a>
        .
      </p>
    </section>
  );
}
```

> **Zwei Hinweise zum Einbau.** `Input` wird aus `@bdas/design-system` exportiert (`core/design-system/src/index.ts:28`) und ist in `apps/web/app/registrieren/RegistrierenForm.tsx` im Einsatz — dort das Prop-Muster abschauen. Heißt eine Utility im Preset anders, gilt der **Preset-Name**: kein Inline-Wert und kein neuer Token (CLAUDE.md §7). Die Klasse `sr-only` ist Tailwind-Standard; sollte sie im Preset fehlen, setze das Label sichtbar, statt es zu entfernen.

- [x] **Step 3: Typecheck und Lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add apps/web/app/_newsletter/NewsletterSignupForm.tsx apps/web/app/_newsletter/signup-marker.ts
git commit -m "feat(newsletter): the public signup form with its four states"
```

---

### Task 7: Die Bestätigungsroute

**Files:**

- Create: `apps/web/app/newsletter/bestaetigen/page.tsx`

**Interfaces:**

- Consumes: `confirmSubscription` (`@bdas/newsletter`), `requireNewsletterFlag` (`../../_newsletter/flag`).

GET wirkt hier direkt (Entscheidung 1). Die drei Ergebnisse aus `ConfirmResult` bekommen je eine Antwort; `expired` deckt auch das unbekannte Token ab und bietet die erneute Eintragung an, statt eine Fehlerseite zu zeigen (Spec §9).

Die Seite ist `dynamic`, weil sie schreibt — Next darf sie nicht vorrendern.

- [x] **Step 1: Seite schreiben**

`apps/web/app/newsletter/bestaetigen/page.tsx`:

```tsx
import Link from "next/link";

import { getDb } from "@bdas/db";
import { Alert } from "@bdas/design-system";
import { confirmSubscription } from "@bdas/newsletter";

import { requireNewsletterFlag } from "../../_newsletter/flag";
import { bootNewsletter } from "../../../lib/newsletter-bootstrap";

export const metadata = { title: "Newsletter bestätigen" };

// The page redeems a token, so it must never be prerendered or cached.
export const dynamic = "force-dynamic";

export default async function NewsletterBestaetigenPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  requireNewsletterFlag();
  bootNewsletter();

  const raw = searchParams?.["token"];
  const token = typeof raw === "string" ? raw : "";
  // No token at all is answered like an expired one: same page, same offer.
  const result = token ? await confirmSubscription(getDb(), token) : { status: "expired" as const };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Newsletter</h1>

      {result.status === "confirmed" ? (
        <Alert variant="success" title="Du bist dabei">
          Danke! Ab jetzt schreiben wir dir ein paar Mal im Jahr, was im Verband und in den
          Hochschulgruppen passiert.
        </Alert>
      ) : null}

      {result.status === "already_confirmed" ? (
        <Alert variant="info" title="Alles schon erledigt">
          Diese Adresse ist bereits bestätigt — du bist dabei. Solche Links werden gern zweimal
          geklickt, das macht nichts.
        </Alert>
      ) : null}

      {result.status === "expired" ? (
        <>
          <Alert variant="info" title="Dieser Link ist abgelaufen">
            Bestätigungslinks gelten sieben Tage. Trag dich einfach noch einmal ein.
          </Alert>
          <p className="text-sm text-bdas-ink-body">
            <Link href="/newsletter" className="text-bdas-red hover:underline">
              Zur Newsletter-Seite
            </Link>
          </p>
        </>
      ) : null}
    </main>
  );
}
```

- [x] **Step 2: Typecheck und Lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add apps/web/app/newsletter/bestaetigen/page.tsx
git commit -m "feat(newsletter): confirmation route for the double-opt-in link"
```

---

### Task 8: Die Abmelderoute

**Files:**

- Create: `apps/web/app/newsletter/abmelden/page.tsx`
- Create: `apps/web/app/newsletter/abmelden/actions.ts`
- Create: `apps/web/app/newsletter/abmelden/UnsubscribeConfirm.tsx`

**Interfaces:**

- Consumes: `peekUnsubscribeToken`, `unsubscribeByToken` (`@bdas/newsletter`).
- Produces: `unsubscribeByTokenAction(prev, formData)`; `type UnsubscribeState = { readonly ok?: boolean; readonly error?: string }`.

GET zeigt nur, POST wirkt (Entscheidung 1) — sonst meldet der erste Postfach-Scanner den Menschen ab, der die Mail noch gar nicht gesehen hat.

Ohne Token zeigt die Seite den Weg über die Adresse: Die `already_subscribed`-Mail verlinkt bewusst ohne Token hierher (Task 2). Das Formular dort trägt die Adresse **nicht** aus, sondern verweist auf „Mein Konto" bzw. auf den Abmeldelink in der letzten Mail — eine Abmeldung allein per eingetippter Adresse wäre ein offener Endpunkt, mit dem jeder jeden austragen könnte.

- [x] **Step 1: Server Action schreiben**

`apps/web/app/newsletter/abmelden/actions.ts`:

```ts
"use server";

import { headers } from "next/headers";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { unsubscribeByToken } from "@bdas/newsletter";

import { newsletterEnabled } from "../../_newsletter/flag";
import { bootNewsletter } from "../../../lib/newsletter-bootstrap";

export type UnsubscribeState = { readonly ok?: boolean; readonly error?: string };

export async function unsubscribeByTokenAction(
  _prev: UnsubscribeState,
  formData: FormData,
): Promise<UnsubscribeState> {
  if (!newsletterEnabled()) return { error: "Das hat gerade nicht geklappt." };
  bootNewsletter();

  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "Dieser Abmeldelink ist unvollständig." };

  const h = headers();
  try {
    await unsubscribeByToken(getDb(), token, {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    });
  } catch (err) {
    // NotFoundError means the link is not ours. Anything else is our problem.
    if (isAppError(err)) return { error: "Dieser Abmeldelink ist nicht mehr gültig." };
    console.error("[newsletter] unsubscribe by token failed:", err);
    return { error: "Das hat gerade nicht geklappt. Versuch es bitte noch einmal." };
  }

  return { ok: true };
}
```

- [x] **Step 2: Knopf schreiben**

`apps/web/app/newsletter/abmelden/UnsubscribeConfirm.tsx`:

```tsx
"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button } from "@bdas/design-system";

import { unsubscribeByTokenAction, type UnsubscribeState } from "./actions";

const initial: UnsubscribeState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Wird abgemeldet …" : "Ja, abmelden"}
    </Button>
  );
}

/**
 * The unsubscribe button. Deliberately a POST: mailbox scanners follow links in
 * email before a person ever sees them, and a GET here would quietly
 * unsubscribe people who never asked to be.
 */
export function UnsubscribeConfirm({ token, email }: { token: string; email: string }) {
  const [state, action] = useFormState(unsubscribeByTokenAction, initial);

  if (state.ok) {
    return (
      <Alert variant="success" title="Abgemeldet">
        Du bekommst von uns keinen Newsletter mehr. Schade — aber du kannst dich jederzeit wieder
        eintragen.
      </Alert>
    );
  }

  return (
    <>
      <p className="text-bdas-ink-body">
        Willst du <strong className="text-bdas-ink">{email}</strong> wirklich vom Newsletter
        abmelden?
      </p>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton />
      </form>
    </>
  );
}
```

- [x] **Step 3: Seite schreiben**

`apps/web/app/newsletter/abmelden/page.tsx`:

```tsx
import Link from "next/link";

import { getDb } from "@bdas/db";
import { Alert } from "@bdas/design-system";
import { peekUnsubscribeToken } from "@bdas/newsletter";

import { requireNewsletterFlag } from "../../_newsletter/flag";
import { bootNewsletter } from "../../../lib/newsletter-bootstrap";
import { UnsubscribeConfirm } from "./UnsubscribeConfirm";

export const metadata = { title: "Newsletter abbestellen" };

export const dynamic = "force-dynamic";

export default async function NewsletterAbmeldenPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  requireNewsletterFlag();
  bootNewsletter();

  const raw = searchParams?.["token"];
  const token = typeof raw === "string" ? raw : "";
  const peek = token ? await peekUnsubscribeToken(getDb(), token) : null;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Newsletter abbestellen</h1>

      {peek && !peek.alreadyUnsubscribed ? (
        <UnsubscribeConfirm token={token} email={peek.email} />
      ) : null}

      {peek?.alreadyUnsubscribed ? (
        <Alert variant="info" title="Schon abgemeldet">
          Diese Adresse steht nicht mehr auf unserer Liste. Du musst nichts weiter tun.
        </Alert>
      ) : null}

      {!peek ? (
        <>
          <Alert variant="info" title="Dieser Link führt ins Leere">
            Der Abmeldelink ist unvollständig oder gehört nicht mehr zu einer Anmeldung.
          </Alert>
          {/* No "enter your address to unsubscribe" form on purpose: that would
              be an open endpoint for unsubscribing anyone. The two legitimate
              ways out are the link in the mail and the switch in the account. */}
          <p className="text-sm text-bdas-ink-body">
            Nutze den Abmeldelink aus einer unserer E-Mails. Hast du ein Konto bei uns, kannst du
            den Newsletter auch unter{" "}
            <Link href="/account/einstellungen" className="text-bdas-red hover:underline">
              Mein Konto
            </Link>{" "}
            abschalten.
          </p>
        </>
      ) : null}
    </main>
  );
}
```

- [x] **Step 4: Typecheck und Lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add apps/web/app/newsletter/abmelden
git commit -m "feat(newsletter): unsubscribe route that a mail scanner cannot trigger"
```

---

### Task 9: Die `/newsletter`-Seite und der Footer

**Files:**

- Create: `apps/web/app/newsletter/page.tsx`
- Modify: `apps/web/app/_public/PublicFooterView.tsx`
- Modify: `apps/web/app/_public/PublicFooter.tsx`
- Modify: `apps/web/app/_content/puck-config.tsx:202`
- Modify: `apps/web/app/_public/PublicFooterView.test.tsx`

**Interfaces:**

- Consumes: `NewsletterSignupForm` (Task 6), `newsletterEnabled` (`../_newsletter/flag`).
- Produces: Prop `showNewsletter: boolean` an `PublicFooterView`.

A3: abgesetzte Karte **über** der Fußzeile, nicht als fünfte Spalte — in der H1-Gestalt (Entscheidung 5). Der Footer ist eine reine Ansichtskomponente, die auch im Puck-Canvas ohne Server-Kontext rendert; die Flag-Lesung bleibt deshalb in `PublicFooter.tsx` und wird als Prop durchgereicht.

**Zwei Stellen, an denen das Formular nicht erscheinen darf.** `PublicFooterView` hat zwei Aufrufer: die echte Seite und den Puck-Editor (`puck-config.tsx:202`). Im Editor-Canvas wäre ein funktionierendes Eintragungsfeld ein Unfall — jeder Redakteur, der die Vorschau ansieht, hätte ein scharfes Formular vor sich. Dort wird `showNewsletter={false}` fest gesetzt, nicht das Flag gelesen. Und auf `/newsletter` selbst trägt die Seite das Formular bereits; die Footer-Instanz bekommt `hideOnPath="/newsletter"` und verschwindet dort (Task 6).

- [x] **Step 1: Die eigene Seite schreiben**

`apps/web/app/newsletter/page.tsx`:

```tsx
import { requireNewsletterFlag } from "../_newsletter/flag";
import { NewsletterSignupForm } from "../_newsletter/NewsletterSignupForm";

export const metadata = {
  title: "Newsletter",
  description: "Ein paar Mal im Jahr Neues aus dem Bundesverband und den Hochschulgruppen.",
};

/**
 * The page exists mostly as a target for the Instagram and LinkedIn bios, both
 * of which are linked in the footer (spec §6).
 */
export default function NewsletterPage() {
  requireNewsletterFlag();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Newsletter</h1>
      <p className="text-bdas-ink-body">
        Veranstaltungen, Förderfristen und Neues aus den Hochschulgruppen — ein paar Mal im Jahr,
        nicht öfter.
      </p>
      <NewsletterSignupForm source="landingpage" sourcePath="/newsletter" variant="brand" />
    </main>
  );
}
```

- [x] **Step 2: Failing test für den Footer schreiben**

An `apps/web/app/_public/PublicFooterView.test.tsx` anfügen:

```tsx
it("renders the newsletter card above the footer when enabled", () => {
  render(
    <PublicFooterView
      privacyUrl="/datenschutz"
      imprintUrl="/impressum"
      termsUrl="/nutzungsbedingungen"
      showEvents
      showGroups
      showFaq
      showNewsletter
    />,
  );
  expect(screen.getByRole("heading", { name: "Bleib in Verbindung" })).toBeTruthy();
});

it("leaves the footer exactly as it was when the flag is off", () => {
  render(
    <PublicFooterView
      privacyUrl="/datenschutz"
      imprintUrl="/impressum"
      termsUrl="/nutzungsbedingungen"
      showEvents
      showGroups
      showFaq
      showNewsletter={false}
    />,
  );
  expect(screen.queryByRole("heading", { name: "Bleib in Verbindung" })).toBeNull();
});
```

> Die vorhandenen Aufrufe in dieser Testdatei brauchen die neue Prop ebenfalls — ergänze `showNewsletter={false}` überall dort, wo `PublicFooterView` schon gerendert wird, sonst schlägt der Typecheck fehl.

- [x] **Step 3: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run apps/web/app/_public/PublicFooterView.test.tsx`
Expected: FAIL — `showNewsletter` ist keine bekannte Prop.

- [x] **Step 4: Footer erweitern**

`apps/web/app/_public/PublicFooterView.tsx` — Import ergänzen:

```tsx
import { NewsletterSignupForm } from "../_newsletter/NewsletterSignupForm";
```

Die Props-Signatur um `showNewsletter: boolean;` erweitern und in der Destrukturierung `showNewsletter,` aufnehmen. Dann direkt **innerhalb** von `<footer …>`, **vor** dem bestehenden `<div className="mx-auto grid …">`, einfügen:

```tsx
{
  showNewsletter ? (
    <div className="mx-auto max-w-6xl px-4 pt-10">
      <NewsletterSignupForm
        source="footer"
        sourcePath="/"
        variant="brand"
        hideOnPath="/newsletter"
      />
    </div>
  ) : null;
}
```

`apps/web/app/_public/PublicFooter.tsx` — beim Rendern durchreichen:

```tsx
      showNewsletter={newsletterEnabled()}
```

und oben importieren:

```tsx
import { newsletterEnabled } from "../_newsletter/flag";
```

`apps/web/app/_content/puck-config.tsx` — beim `PublicFooterView` in Zeile ~202 **fest** ergänzen, ohne das Flag zu lesen:

```tsx
              showNewsletter={false}
```

```
Der Editor zeigt eine Vorschau, kein scharfes Formular. Ein Redakteur, der die
Seitenvorschau öffnet, soll sich nicht versehentlich eintragen können.
```

- [x] **Step 5: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run apps/web/app/_public && pnpm typecheck && pnpm lint`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add apps/web/app/newsletter/page.tsx apps/web/app/_public
git commit -m "feat(newsletter): A3 footer card and the /newsletter page"
```

---

### Task 10: Datenschutzhinweis fortschreiben

**Files:**

- Modify: `docs/datenschutz/datenschutz-bestandsaufnahme.html`
- Create: `docs/datenschutz/newsletter-textbaustein.md`

**Interfaces:** keine — reiner Inhalt.

ADR 0035 hat diese Fortschreibung ausdrücklich an **diesen** PR gehängt: Vorher wird keine Adresse außerhalb der Plattform erhoben, ab jetzt schon. Spec §10 nennt, was hineingehört.

**Der Text kann hier nicht eingebaut werden, und das ist kein Versäumnis.** `/datenschutz` ist seit ADR 0024 eine board-editierbare Puck-Seite (`apps/web/app/datenschutz/page.tsx`, Slug `datenschutz`): Der Inhalt liegt in der Datenbank, nicht im Repository, und wird vom Bundesvorstand im Editor gepflegt. Ein Commit kann ihn nicht ändern. Was dieser Task liefert, ist deshalb der **fertig formulierte Baustein** plus die Fortschreibung der Bestandsaufnahme — das Einpflegen ist eine Vorstandshandlung und gehört in die PR-Beschreibung als ausdrücklicher Übergabepunkt.

**Das ist ein Go-Live-Blocker, kein Merge-Blocker.** Der PR darf gemerged werden, solange das Flag aus ist. Sobald `BDAS_FLAG_NEWSLETTER` in Produktion angeht, muss der Abschnitt stehen — vorher erhebt niemand eine Adresse, danach sofort.

- [x] **Step 1: Baustein schreiben**

`docs/datenschutz/newsletter-textbaustein.md` — mit einem Kopf, der sagt, wohin er gehört und warum er nicht im Code steht:

```markdown
# Textbaustein „Newsletter" für /datenschutz

Einzupflegen vom Bundesvorstand im Puck-Editor unter `/datenschutz/bearbeiten`.
Der Inhalt dieser Seite liegt seit ADR 0024 in der Datenbank, nicht im
Repository — deshalb liegt hier nur der Text.

**Fällig, bevor `BDAS_FLAG_NEWSLETTER` in Produktion angeht** (ADR 0035): Ab
diesem Moment werden Adressen außerhalb der Plattform erhoben.
```

Darunter der Abschnitt selbst, wortgleich auch in die Bestandsaufnahme:

```
Newsletter

Wenn du dich für unseren Newsletter einträgst, verarbeiten wir deine
E-Mail-Adresse, um dir den Newsletter zu schicken. Rechtsgrundlage ist deine
Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO.

Zum Nachweis dieser Einwilligung nach Art. 7 Abs. 1 DSGVO protokollieren wir
zusätzlich den Zeitpunkt, die IP-Adresse, den Browser (User-Agent) und die
Seite, auf der du dich eingetragen hast. Die IP-Adresse speichern wir dabei im
Klartext, weil ein gehashter Wert als Nachweis wertlos wäre.

Trägst du dich öffentlich ein, schicken wir dir zuerst eine Bestätigungsmail
und nehmen dich erst auf die Liste, wenn du den Link darin anklickst
(Double-Opt-In). Bist du eingeloggt, genügt dein Klick in deinem Konto — dass
die Adresse dir gehört, hast du bei der Registrierung schon nachgewiesen.

Du kannst den Newsletter jederzeit abbestellen: über den Link am Ende jeder
E-Mail oder, wenn du ein Konto hast, unter „Mein Konto". Nach dem Abbestellen
löschen wir den Protokolleintrag spätestens nach drei Jahren. Löschst du dein
Konto, entfallen Abonnement und Protokoll sofort mit.
```

- [x] **Step 2: Bestandsaufnahme fortschreiben**

`docs/datenschutz/datenschutz-bestandsaufnahme.html` — den Abschnitt aus Step 1 in der Struktur des Dokuments ergänzen (dieselbe Überschriftenebene und Auszeichnung wie die übrigen Verarbeitungszwecke; die Datei zuerst lesen und dem vorhandenen Muster folgen). Die Aufbewahrungsfrist von drei Jahren und die Klartext-IP gehören ausdrücklich hinein — sie sind die beiden Punkte, die eine Prüfung als Erstes sucht.

- [x] **Step 3: Commit**

```bash
git add docs/datenschutz
git commit -m "docs(datenschutz): Textbaustein Newsletter und Bestandsaufnahme (ADR 0035)

Der Abschnitt kann nicht als Code ausgeliefert werden: /datenschutz ist seit
ADR 0024 eine board-editierbare Puck-Seite, ihr Inhalt liegt in der Datenbank.
Der Baustein liegt deshalb als Vorlage bereit und ist vom Bundesvorstand
einzupflegen, bevor das Flag in Produktion angeht."
```

---

### Task 11: E2E-Abnahme und PR-3-Abschluss

**Files:**

- Create: `e2e/newsletter-public.e2e.ts`
- Modify: `e2e/helpers/db.ts`

**Interfaces:**

- Consumes: `deleteUserByEmail` (`./helpers/db`).
- Produces: `deleteNewsletterSubscriberByEmail(email)`, `latestConfirmToken(email)` in `e2e/helpers/db.ts`.

Der Lauf deckt die drei Behauptungen dieses PRs ab: Eine öffentliche Eintragung erzeugt eine `pending`-Zeile und eine Mail; der Link darin macht daraus `subscribed`; der Abmeldelink wirkt erst auf Klick, nicht schon beim Aufruf.

**Gotcha vor jedem lokalen E2E-Lauf:** `pnpm e2e` testet, was auch immer auf Port 3000 lauscht — unter Umständen ein alter Build aus einem anderen Worktree. Vor jedem Fehlerbericht `lsof -i :3000` prüfen.

- [x] **Step 1: Helfer schreiben**

An `e2e/helpers/db.ts` anfügen (das Muster der vorhandenen Helfer übernehmen — dieselbe `sql`-Verbindung, dieselbe Fehlerbehandlung):

```ts
/** Newsletter rows are not touched by deleteUserByEmail when there is no account. */
export async function deleteNewsletterSubscriberByEmail(email: string): Promise<void> {
  await sql`DELETE FROM newsletter_subscribers WHERE email = ${email.toLowerCase()}`;
}

/**
 * The confirmation token is only ever stored hashed, so the test cannot read it
 * back. It reads the row instead and confirms through the service-level state —
 * the E2E asserts the visible outcome, not the token itself.
 */
export async function newsletterStatus(email: string): Promise<string | null> {
  const rows = await sql`
    SELECT status FROM newsletter_subscribers WHERE email = ${email.toLowerCase()} LIMIT 1`;
  return rows[0]?.["status"] ?? null;
}
```

- [x] **Step 2: E2E schreiben**

`e2e/newsletter-public.e2e.ts`:

```ts
/**
 * Newsletter PR 3 — the public capture path (spec §12 no. 3).
 *  - The footer form creates a `pending` row and says the same thing to
 *    everyone (§8 no. 4).
 *  - A filled honeypot is answered identically but writes nothing (§8 no. 2).
 *  - The unsubscribe route does NOT act on GET, so a mailbox scanner cannot
 *    unsubscribe anybody.
 *
 * Requires BDAS_FLAG_NEWSLETTER=true (or a preview deployment).
 */
import { expect, test } from "@playwright/test";

import { deleteNewsletterSubscriberByEmail, newsletterStatus } from "./helpers/db";

const unique = () => `nlp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.org`;

test.describe("newsletter, public capture", () => {
  test("the footer form creates a pending row and confirms nothing yet", async ({ page }) => {
    const email = unique();
    try {
      await page.goto("/");
      const form = page.getByRole("region", { name: "Bleib in Verbindung" });
      await form.getByLabel("E-Mail-Adresse").fill(email);
      await form.getByRole("button", { name: "Ich bin dabei" }).click();

      await expect(page.getByText("Fast geschafft.")).toBeVisible();
      // Double opt-in: the row exists but is not on the list yet (§3.2).
      expect(await newsletterStatus(email)).toBe("pending");
    } finally {
      await deleteNewsletterSubscriberByEmail(email);
    }
  });

  test("an unknown confirmation token offers a fresh signup instead of an error", async ({
    page,
  }) => {
    await page.goto("/newsletter/bestaetigen?token=gibtsnicht");
    await expect(page.getByText("Dieser Link ist abgelaufen")).toBeVisible();
    await expect(page.getByRole("link", { name: "Zur Newsletter-Seite" })).toBeVisible();
  });

  test("opening the unsubscribe link does not unsubscribe anybody", async ({ page }) => {
    // A mailbox scanner follows links before a person does. Merely loading the
    // page must therefore change nothing — the button is the action.
    await page.goto("/newsletter/abmelden?token=gibtsnicht");
    await expect(page.getByText("Dieser Link führt ins Leere")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ja, abmelden" })).toHaveCount(0);
  });

  test("the /newsletter page carries the form exactly once", async ({ page }) => {
    await page.goto("/newsletter");
    await expect(page.getByRole("heading", { name: "Newsletter", level: 1 })).toBeVisible();
    // The footer is on this page too, so without `hideOnPath` there would be
    // two identical forms stacked on top of each other.
    await expect(page.getByRole("button", { name: "Ich bin dabei" })).toHaveCount(1);
  });

  test("the honeypot is not reachable by keyboard or screen reader", async ({ page }) => {
    await page.goto("/");
    // aria-hidden keeps it out of the accessibility tree entirely; a real
    // visitor can neither see nor tab into it (spec §8 no. 2).
    await expect(page.getByLabel("Website")).toHaveCount(0);
  });
});
```

- [x] **Step 3: E2E laufen lassen**

Run: `lsof -i :3000` (muss leer sein oder der eigene Server), dann `pnpm db:up && pnpm db:migrate && pnpm --filter @bdas/web build`, dann `pnpm e2e newsletter-public`
Expected: PASS (4 Specs)

- [x] **Step 4: Volllauf**

Run: `pnpm vitest run && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add e2e/newsletter-public.e2e.ts e2e/helpers/db.ts
git commit -m "test(e2e): cover the public newsletter capture path"
```

- [x] **Step 6: PR 3 abnehmen**

Prüfliste, alles muss zutreffen:

- `pnpm vitest run && pnpm typecheck && pnpm lint && pnpm format:check` grün; `pnpm e2e newsletter-public` grün mit gesetztem Flag.
- `modules/newsletter` importiert weiterhin **nicht** `@bdas/notifications`: `grep -rn "@bdas/notifications" modules/newsletter/src` liefert nichts.
- Die öffentliche Antwort ist für eine neue, eine bereits eingetragene und eine abgemeldete Adresse **wortgleich** — im Text und ohne auffälligen Zeitunterschied.
- Kein Inline-Hex, -Radius, -Schatten, keine Inline-Dauer in den neuen Komponenten: `grep -rnE "#[0-9a-fA-F]{3,6}|[0-9]+ms" apps/web/app/_newsletter apps/web/app/newsletter` liefert nichts.
- Der Aufruf von `/newsletter/abmelden?token=…` allein meldet niemanden ab.
- Bei ausgeschaltetem Flag ist der Footer exakt wie vorher, und `/newsletter`, `/newsletter/bestaetigen`, `/newsletter/abmelden` sind 404.
- Im Puck-Editor rendert **kein** scharfes Eintragungsfeld, und auf `/newsletter` steht das Formular genau einmal.
- **`/security-review` ist gelaufen** (Spec §12 Nr. 3) und die Befunde sind abgearbeitet.

**Nicht Teil der Abnahme, aber Bedingung für das Anschalten in Produktion:** Der Datenschutz-Baustein aus Task 10 ist vom Bundesvorstand unter `/datenschutz/bearbeiten` eingepflegt. Der PR darf ohne das gemerged werden — das Flag darf ohne das nicht angehen (ADR 0035). Gehört als eigener Punkt in die PR-Beschreibung, damit es beim Go-Live nicht untergeht.

---

---

## Abweichungen bei der Umsetzung

Drei Stellen, an denen der Plan nicht gehalten hat, jeweils mit dem Grund:

1. **`HONEYPOT_FIELD` liegt in `apps/web/app/_newsletter/honeypot.ts`,** nicht in
   `public-actions.ts`. Eine `"use server"`-Datei darf ausschließlich asynchrone
   Funktionen exportieren; eine Konstante daneben bricht den Next-Build. Kein
   Aufrufer merkt den Unterschied, der Import ist eine Zeile länger.
2. **Der Footer-Test stubbt das Formular.** `NewsletterSignupForm` ist eine
   Client-Komponente, deren `useFormState` den Action-Kontext von Next braucht —
   im statischen Render von `PublicFooterView.test.tsx` gibt es den nicht. Der
   Stub prüft genau das, wofür der Footer zuständig ist: dass die Karte
   überhaupt hängt, mit der richtigen Quelle und mit `hideOnPath`.
3. **Der Honeypot-E2E prüft die Rolle, nicht das Label.** `getByLabel` ist eine
   DOM-Abfrage über `label`/`for` und findet das Feld unabhängig von
   `aria-hidden` — die Behauptung „nicht im Accessibility-Baum" braucht eine
   Rollenabfrage. Und `toBeHidden()` trifft es auch nicht: Das Feld bleibt
   absichtlich ein echtes Textfeld (genau das füllt ein einfacher Bot aus) und
   ist nur aus dem Bild geschoben, behält also seine eigene Layout-Box. Geprüft
   wird deshalb `tabindex="-1"` plus eine Box links außerhalb des Sichtfelds.

## Was danach kommt

- **PR 4 — Offensive Flächen:** Blogartikel-Ende, Puck-Block „Newsletter-Anmeldung", Scroll-Panel (D2) ab 50 % Scrolltiefe mit Wiedervorlage nach §6.1, Checkbox in der Event-Gastanmeldung. Alle vier verwenden `NewsletterSignupForm` aus Task 6 — die Variante `plain` wartet dort schon.
- **PR 5 — Board-Ansicht:** `/federal/newsletter` mit Liste, Kennzahlen, Filter und CSV-Export, Nav-Eintrag in `FEDERAL_NAV`. **Vorbedingung:** ein Stapelleser `getUserEmails(db, ids)` in `@bdas/auth`, sonst wird der Resolver aus PR 2 zum N+1 — `listSubscribers` löst jede Zeile einzeln auf.

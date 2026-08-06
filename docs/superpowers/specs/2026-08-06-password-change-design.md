# Passwort ändern im eingeloggten Zustand

Datum: 2026-08-06
Betrifft: `modules/auth` und `/account` (Mein Konto)
Issue: [#108](https://github.com/ccempion/bdas-webseite/issues/108) (Unteraufgabe von #52)

## Problem

Wer sein Passwort ändern will, muss sich heute abmelden, „Passwort vergessen"
klicken, auf eine Mail warten und dem Link folgen. Das ist der Weg für jemanden,
der sein Passwort _nicht_ kennt. Wer es kennt und nur wechseln will — nach einem
geteilten Gerät, einem Verdacht, oder aus Routine — hat keinen Weg, der ohne
Postfach auskommt.

## Nicht-Ziele

- Kein Zurücksetzen per Mail anfassen. `requestPasswordReset` /
  `completePasswordReset` bleiben unverändert.
- Keine Sitzungsübersicht („aktive Geräte"). Das ist eine eigene Aufgabe.
- Keine zweite Faktor-Stufe. Das aktuelle Passwort ist der Nachweis.
- Kein neues Design-System-Primitive.

## Modulgrenze

`auth` besitzt `auth_credentials` und `auth_sessions`. Der Dienst gehört also
nach `modules/auth` — obwohl #108 unter #52 (Profildaten) hängt. `profile` wird
nicht angefasst. Die App-Schicht komponiert das Formular auf `/account`.

Regel 6 (Feature-Flag pro Modul) greift nicht: das hier ist kein neues Modul,
sondern eine Erweiterung von `auth`. `/account` liegt bereits hinter
`requireAuthFlag()`.

## Entwurf

### 1. Dienst — `modules/auth/src/services/password-change.ts`

```ts
export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
});

export type ChangePasswordContext = {
  readonly userId: string;
  readonly sessionId: string;
  readonly ip: string;
};

export async function changePassword(
  db: Db,
  input: unknown,
  ctx: ChangePasswordContext,
): Promise<{ readonly email: string }>;
```

Ablauf:

1. `ChangePasswordInput.safeParse` — schlägt fehl ⇒ `ValidationError`. Das neue
   Passwort validiert gegen das vorhandene `passwordSchema`; die Regel bleibt an
   einer Stelle (`password.ts`).
2. Rate Limit `password-change:user:${userId}`, 5 Versuche pro Stunde. Ohne das
   ist das Formular ein Passwort-Orakel für jeden, der eine fremde Sitzung hält:
   beliebig viele Rateversuche gegen `currentPassword`, ohne Spur.
3. Credential-Zeile und E-Mail über `userId` laden. Fehlt sie ⇒ `NotFoundError`.
4. `verifyPassword(currentPassword, hashedPassword)` — falsch ⇒
   `ValidationError("Aktuelles Passwort ist falsch.")`. Der Hash bleibt
   unangetastet.
5. Neues Passwort gleich dem aktuellen ⇒
   `ValidationError("Das neue Passwort muss sich vom aktuellen unterscheiden.")`.
   Sonst meldet ein folgenloser Klick den Nutzer auf allen anderen Geräten ab.
6. Eine Transaktion:
   - `auth_credentials`: `hashedPassword`, `algorithm = PASSWORD_ALGORITHM`,
     `updatedAt = now`.
   - `auth_sessions`: alle offenen Sitzungen des Nutzers auf `revokedAt = now`,
     **außer `ctx.sessionId`**. Ein gestohlener Cookie überlebt die Änderung
     nicht; die Sitzung, aus der geändert wurde, bleibt bestehen.
7. Event `auth.password.changed` veröffentlichen.
8. `{ email }` zurückgeben.

Der Dienst verschickt die Mail **nicht** selbst. Er gibt die Adresse zurück, die
Server Action ruft den Notifier — dieselbe Aufteilung wie bei
`requestPasswordReset`, das den Token zurückgibt und den Versand dem Aufrufer
überlässt.

### 2. Event

```ts
export type PasswordChanged = {
  readonly type: "auth.password.changed";
  readonly userId: string;
  readonly at: Date;
};
```

Aufgenommen in die `AuthEvent`-Union und aus `index.ts` exportiert. Bewusst
getrennt von `PasswordReset`: „ich habe es gewechselt" und „ich hatte es
verloren" sind unterschiedliche Signale für alles, was später mithört.

### 3. Notifier

Neue Variante in `AuthMessage`:

```ts
export type PasswordChangedMessage = {
  readonly kind: "changed";
  readonly to: string;
};
```

- `consoleNotifier`: eine Zeile analog zu `verify` / `reset`.
- `createResendNotifier`: Betreff „BDAS — Passwort geändert". Text: das Passwort
  wurde soeben geändert; wenn das nicht du warst, setze es sofort über
  „Passwort vergessen" zurück und melde dich beim Vorstand.

Kein Link mit Token in dieser Mail. Eine Änderungsbenachrichtigung ist ein
Stolperdraht, keine Handlung — ein Token darin wäre eine neue Angriffsfläche für
eine Mail, die per Definition auch bei Übernahme des Kontos verschickt wird.

Der Versand ist best-effort: schlägt er fehl, wird geloggt, aber die Änderung
gilt. Sie ist zu diesem Zeitpunkt committet.

### 4. UI — `/account`

Neue Datei `apps/web/app/account/ChangePasswordCard.tsx`, Client Component,
eingebunden in `apps/web/app/account/page.tsx` unterhalb der Karte „Meine Daten".

- Aufgeklappt wird über das `<details>`-Idiom aus §7 (linke Kante + Halo bei
  `[open]`, `+` dreht zu `×`). Zusammengeklappt im Ruhezustand: Passwortwechsel
  ist eine seltene Handlung und soll die Kontoseite nicht dominieren.
- Felder: „Aktuelles Passwort" (`autoComplete="current-password"`) und „Neues
  Passwort" (`autoComplete="new-password"`, `minLength={10}`), beide
  `PasswordInput`, Hint aus `PASSWORD_RULE_HINT`. Kein
  „Passwort wiederholen" — `PasswordInput` kann die Eingabe sichtbar machen, was
  denselben Zweck mit einem Feld weniger erfüllt.
- Fehler als `Alert variant="error"` über dem Formular.
- Erfolg: Formular klappt zu, `Alert variant="success"` mit „Passwort geändert.
  Andere Geräte wurden abgemeldet." Kein Redirect — die aktuelle Sitzung lebt.

Server Action in neuer Datei `apps/web/app/account/password-actions.ts`, passend
zur bestehenden Aufteilung `actions.ts` / `profile-actions.ts` /
`photo-actions.ts`. Sie liest den Session-Cookie, holt über `getCurrentUser`
`userId` **und** `sessionId`, ruft `changePassword`, verschickt danach die Mail
und gibt `{ ok: true }` oder `{ error }` zurück.

## Fehlerbehandlung

| Fall | Ergebnis |
| --- | --- |
| Nicht angemeldet | `{ error: "Anmeldung erforderlich." }` |
| Aktuelles Passwort falsch | `ValidationError`, Hash unverändert, Sitzungen unverändert |
| Neues Passwort zu schwach | `ValidationError` mit der Regel aus `passwordSchema` |
| Neues = aktuelles Passwort | `ValidationError`, kein Schreibvorgang |
| Mehr als 5 Versuche/Stunde | `RateLimitError` |
| Mailversand scheitert | Änderung gilt, Fehler wird geloggt |

`isAppError` fängt alles davon in der Action ab und gibt `err.message` an das
Formular — dasselbe Muster wie `saveProfileAction`.

## Tests

Alle im selben PR.

**`modules/auth/src/services/password-change.test.ts`** (Integration gegen
Docker-Postgres, `describeIfDb` wie in `index.test.ts`):

1. Happy Path: altes Passwort verifiziert danach nicht mehr, neues schon.
2. Falsches aktuelles Passwort: `ValidationError`, Hash in der DB unverändert.
3. Zu schwaches neues Passwort: `ValidationError`, kein Schreibvorgang.
4. Neues gleich aktuellem: `ValidationError`, kein Schreibvorgang.
5. Sitzungen: zwei weitere Sitzungen angelegt, nach der Änderung sind beide
   `revokedAt`, die aufrufende ist es nicht — `getCurrentUser` liefert sie
   weiterhin.
6. Rate Limit: der 6. Versuch in einer Stunde wirft `RateLimitError`.
7. Event `auth.password.changed` wird mit der richtigen `userId` veröffentlicht.

**`modules/auth/src/notifier-resend.test.ts`**: der `changed`-Zweig rendert
Betreff und Text.

**`e2e/auth.e2e.ts`**: angemeldet auf `/account`, Karte aufklappen, Passwort
ändern, Bestätigung sehen; abmelden und mit dem neuen Passwort anmelden.

## Folgen

- Der Nutzer kann sein Passwort ohne Postfachzugriff wechseln.
- Eine Passwortänderung beendet alle anderen Sitzungen. Wer auf Telefon und
  Laptop angemeldet ist, muss sich auf dem anderen Gerät neu anmelden — das ist
  der Zweck, nicht ein Nebeneffekt.
- `AuthMessage` hat eine dritte Variante; jeder Notifier-Treiber muss sie
  behandeln. Es gibt genau zwei (`consoleNotifier`, Resend), beide in diesem PR.
- Ein neues Event, auf das heute niemand hört.

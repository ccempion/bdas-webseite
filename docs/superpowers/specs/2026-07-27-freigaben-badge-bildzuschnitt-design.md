# Freigabe-Zähler, bedingter Pending-Hinweis, Bildzuschnitt, Spam-Hinweise

Datum: 2026-07-27
Betrifft: `PublicHeader`, `/account`, den Profilbild-Upload und drei
E-Mail-Bestätigungsseiten

## Problem

Vier Beobachtungen aus der Nutzung:

1. Wer etwas freigeben muss — Mitglieder, Gruppenwechsel, gemeldete Beiträge —
   erfährt es nur, wenn er von sich aus in den Board-Bereich navigiert. Es gibt
   keinen Hinweis, der einen abholt.
2. `/account` zeigt dem Bundesvorstand dauerhaft den Block „Du hast
   Bundesvorstands-Rechte. Pending-Mitglieder verwalten →", auch wenn die
   Warteschlange leer ist. Er liest sich als Aufgabe, ist aber meistens keine.
   Der lokale Vorstand hat dieselbe Warteschlange und sieht auf `/account`
   überhaupt nichts davon.
3. Das Profilbild wird so hochgeladen, wie es aus der Kamera kommt. Wer ein
   Querformat wählt, bekommt einen Bildausschnitt, den er nicht bestimmt hat,
   und keine Möglichkeit, ihn zu korrigieren.
4. Der Hinweis, auch im Spam-Ordner nachzusehen, steht nur auf
   `/registrieren/erfolg` (klein und grau unter der Box) und im
   „Link erneut senden"-Formular. Beim Passwort-Zurücksetzen und bei der
   Gast-Anmeldung zu Events fehlt er.

## Nicht-Ziele

- Kein neues Modul, kein neues Feature-Flag, keine Migration.
- Kein Zuschnitt für Event-Titelbilder, Blog-Bilder oder das Puck-Foto. Bei
  Inhaltsbildern ist ein erzwungener Zuschnitt eher hinderlich; das Profilbild
  ist der Fall mit festem Rahmen.
- Keine Server-seitige Bildverarbeitung. Der signierte Upload-Pfad bleibt, wie
  er ist.
- Keine Änderung an den Entscheidungs-Services. Freigeben, ablehnen und
  Meldungen verwerfen funktionieren unverändert; hier entsteht nur Sichtbarkeit.

## Entwurf

### 1. Freigabe-Zähler im Kopfmenü

Gezählt werden drei Dinge, alle drei sind ein Klick, der eine Entscheidung
abschließt:

- offene Mitglieder-Freigaben (`status = "pending"`),
- eingehende Gruppenwechsel, die der Betrachter entscheiden darf,
- offene Blog-Meldungen.

#### Modul-Ebene

Beide Module bekommen einen echten Zähl-Service. Die vorhandenen `list…`-Services
für eine Zahl zu missbrauchen, hieße auf einem Header, der auf jeder Seite
rendert, vollständige Zeilen inklusive Join zu laden.

`modules/members/src/services/approval-counts.ts`:

```ts
export type ApprovalCounts = {
  readonly pendingMembers: number;
  readonly incomingGroupChanges: number;
};

export async function countPendingApprovals(db: Db, actor: Actor): Promise<ApprovalCounts>;
```

Sichtbarkeit exakt wie bisher: `pendingMembers` folgt der Regel aus
`listPendingMembers` (ADR 0007 — Bundesvorstand alle, lokaler Vorstand nur die
Pending-Mitglieder seiner Gruppen), `incomingGroupChanges` zählt genau die
Anträge, für die `listOpenGroupChanges` heute `canDecide: true` liefert, inklusive
des föderalen Rückfalls aus ADR 0021. Die dafür nötigen internen Helfer
(`scopedGroupIds`, `groupHasActiveLocalBoard`, `canDecideJoinRequest`) liegen
bereits im Modul und werden wiederverwendet.

Ein Unterschied zu `listPendingMembers`: für einen Actor ohne Vorstandsrolle wird
**kein** `ForbiddenError` geworfen, sondern `{ pendingMembers: 0,
incomingGroupChanges: 0 }` zurückgegeben. Der Zähler hängt am Header jeder Seite;
eine geworfene Berechtigung wäre dort ein Seitenfehler statt einer Null.

`modules/blog/src/services/report.ts`:

```ts
export async function countOpenReports(db: Db): Promise<number>;
```

Aus `modules/blog/src/index.ts` re-exportiert. Die Bundesvorstands-Schranke bleibt
wie bei `listOpenReports` in der App-Schicht — das Modul zählt, die App
entscheidet, wer fragen darf.

#### App-Ebene

`apps/web/app/_dashboard/approvals.ts`:

```ts
export type ApprovalSummary = {
  readonly pendingMembers: number;
  readonly incomingGroupChanges: number;
  readonly openReports: number;
  readonly total: number;
};

export const loadApprovalCounts: () => Promise<ApprovalSummary>;
```

Mit React `cache()` umschlossen, damit `PublicHeader` und `/account` sich
innerhalb eines Requests einen Round-Trip teilen.

Reihenfolge der Abbrüche — der Normalfall darf nichts kosten:

1. kein eingeloggter Member → alles 0, keine Abfrage;
2. `canAdministerBoard(me.grants)` falsch → alles 0, keine Abfrage;
3. sonst `countPendingApprovals`; `countOpenReports` nur zusätzlich, wenn
   `isFederalBoard(me.grants)` **und** das `blog`-Flag an ist.

`pendingMembers` und `incomingGroupChanges` setzen das `members`-Flag voraus,
sonst bleiben sie 0.

#### Darstellung

`core/design-system/src/components/Badge.tsx`, aus `index.ts` exportiert:

```tsx
<Badge count={3} label="offene Freigaben" />
```

Roter Kreis in `brand.red`, weiße Ziffer in der kleinsten Schriftgröße der
Tokens, ab 100 als `99+`. Bei `count === 0` rendert die Komponente `null`, damit
kein Aufrufer selbst prüfen muss. Für Screenreader trägt sie
`aria-label="3 offene Freigaben"`; das `label`-Prop liefert nur den Plural-Teil.
Ausschließlich vorhandene Tokens, kein neuer Hex, kein neuer Radius.

In `apps/web/app/_public/PublicHeader.tsx` an drei Stellen:

- am Namens-Pill im Desktop-Menü, rechts neben dem Vornamen und vor dem
  Aufklapp-Pfeil;
- am „Menü"-Button der mobilen Ansicht — dort gibt es kein Namens-Pill, ohne
  diesen Platz wäre die Zahl auf dem Handy unsichtbar;
- am Eintrag „Board-Bereich" im aufgeklappten Menü (Desktop und Mobil), damit
  erkennbar ist, wohin der Klick führt.

Ist niemand eingeloggt oder ist `total === 0`, ändert sich am Header nichts.

### 2. `/account`: Hinweis nur bei tatsächlicher Arbeit

Der heutige Block in `apps/web/app/account/page.tsx`

```tsx
{isBoard ? <Alert variant="info" title="Bundesvorstand">…</Alert> : null}
```

entfällt. An seine Stelle tritt ein Alert, der zwei Bedingungen ändert:

- Er rendert **nur** bei `total > 0`.
- Er gilt für **jeden** Vorstand (`canAdministerBoard`), nicht nur den
  Bundesvorstand. Ein lokaler Vorstand hat dieselbe Warteschlange und sah sie auf
  `/account` bisher nicht.

Inhalt sind bis zu drei Zeilen, jede nur bei eigenem Zähler > 0, jede mit dem
Ziel, an dem die Entscheidung getroffen wird:

- Mitglieder-Freigaben → `/admin/pending-members` für den Bundesvorstand,
  `/gruppe/<slug>/members` für einen lokalen Vorstand (der Slug kommt aus der
  bereits geladenen Gruppe des Members);
- Gruppenwechsel → dasselbe Ziel wie die Mitglieder-Freigaben, dort liegt die
  eingehende Warteschlange;
- Meldungen → `/blog/meldungen`.

Bewusst in Kauf genommen: ist nichts offen, verliert `/account` seinen einzigen
sichtbaren Einstieg in den Board-Bereich. Der Weg bleibt über „Board-Bereich" im
Kopfmenü erhalten, das für jeden Vorstand rendert.

### 3. Profilbild zuschneiden

Der Zuschnitt sitzt zwischen „Datei von `DropZone`/Dateidialog akzeptiert" und
`uploadImage` und ist damit für Klick-Auswahl und Drop derselbe Schritt. Zugeschnitten wird im Browser; die
hochgeladene Datei ist das fertige Quadrat. Der Server, die Route
`POST /api/profile/upload-url` und `upload-image.ts` bleiben unverändert, und die
hochgeladene Datei wird dabei kleiner statt größer.

`apps/web/app/_profile/crop.ts` — rein, ohne React, hier liegen die Unit-Tests:

```ts
export type CropState = { readonly zoom: number; readonly x: number; readonly y: number };
export type SourceRect = { sx: number; sy: number; sw: number; sh: number };

export function minZoom(natural: Size, frame: number): number;
export function clampOffset(state: CropState, natural: Size, frame: number): CropState;
export function sourceRect(state: CropState, natural: Size, frame: number): SourceRect;
```

`minZoom` ist der Faktor, bei dem die kürzere Seite den Rahmen gerade füllt —
darunter darf nicht gezoomt werden, sonst entstünden leere Ränder.
`clampOffset` hält das Bild so, dass der Rahmen immer vollständig bedeckt ist.
`sourceRect` übersetzt Zoom und Versatz in die Argumente für `drawImage`.

`apps/web/app/_profile/CropDialog.tsx` (`"use client"`) — natives `<dialog>`,
`showModal()`, womit Fokusfalle und Escape ohne eigenen Code kommen. Quadratischer
Rahmen mit Kreismaske als Vorschau des späteren Avatars, darunter ein
`<input type="range">` für den Zoom, daneben „Abbrechen" und „Übernehmen".

Bedienung: Ziehen mit Zeiger (Pointer Events, damit Touch mit abgedeckt ist),
Zoom über Regler und Mausrad, Pfeiltasten verschieben in kleinen Schritten,
`+`/`−` zoomen. Der Rahmen ist fokussierbar und trägt eine `aria`-Beschreibung
dieser Tasten.

„Übernehmen" zeichnet den Ausschnitt mit `sourceRect` auf ein 512×512-`<canvas>`,
erzeugt per `toBlob("image/webp", 0.9)` eine `File` mit dem ursprünglichen
Basisnamen und `.webp` und übergibt sie an `uploadImage`. `image/webp` steht
bereits in `IMAGE_MIME` in `apps/web/app/_upload/accept.ts`, aus dem sowohl der
Client als auch die Route `POST /api/profile/upload-url` ihre Allowlist lesen;
`PROFILE_IMAGE.maxBytes` (5 MB) kann ein 512×512-WebP nicht überschreiten.

Eingehängt in beiden Aufrufern, die heute denselben Pfad fahren
(`DropZone accept={PROFILE_IMAGE}` → `uploadImage`):

- `apps/web/app/account/AccountAvatar.tsx`
- `apps/web/app/profil/PhotoField.tsx`

Der Bild-Upload ist schon heute vollständig client-seitig (`uploadImage`), der
Zuschnitt verschlechtert die Lage ohne JavaScript also nicht. Schlägt `toBlob`
fehl, erscheint die bereits vorhandene Fehlerzeile und es wird nichts
hochgeladen — lieber kein Bild als ein Bild, das der Nutzer so nicht bestätigt
hat.

### 4. Spam-Hinweis

Drei Textänderungen, kein neuer Code:

- `apps/web/app/passwort-zuruecksetzen/RequestForm.tsx` — der Erfolgs-Alert nennt
  heute nur die Gültigkeitsdauer; der Hinweis kommt dazu.
- `apps/web/app/events/[id]/GuestRegisterForm.tsx` — der Abmelde-Link steckt in
  genau dieser Mail, der Hinweis ist hier am wichtigsten.
- `apps/web/app/registrieren/erfolg/page.tsx` — der Hinweis wandert aus der
  grauen Fußzeile in den Alert. Die Zeile „oder fordere einen neuen Link an"
  bleibt darunter stehen.

Drei Sätze mit leicht unterschiedlichem Kontext rechtfertigen keine geteilte
Konstante.

## Tests

Vitest läuft in `apps/web` mit `environment: "node"` ohne Component-Testing.
Also:

- `apps/web/app/_profile/crop.test.ts` — `minZoom` für Hoch- und Querformat,
  `clampOffset` lässt keinen leeren Rand zu, `sourceRect` liefert bei
  `zoom = minZoom` und zentriertem Versatz den mittigen Quadrat-Ausschnitt.
- `apps/web/app/_dashboard/approvals.test.ts` — Nicht-Vorstand ergibt `total: 0`
  ohne Modul-Aufruf, `total` summiert korrekt, Meldungen zählen nur für den
  Bundesvorstand und nur bei gesetztem `blog`-Flag.
- `modules/members/src/approval-counts.test.ts` — Integration gegen
  Docker-Postgres: Bundesvorstand zählt alle Pending-Mitglieder, ein lokaler
  Vorstand nur die seiner Gruppe, ein einfaches Mitglied bekommt Nullen statt
  eines Fehlers; ein eingehender Gruppenwechsel zählt beim Zielvorstand und nicht
  beim Herkunftsvorstand.
- `modules/blog/src/index.test.ts` — `countOpenReports` zählt offene Meldungen und
  ignoriert verworfene.
- `e2e/approvals-badge.e2e.ts` — ein Vorstand mit einem offenen Antrag sieht die
  Zahl im Kopfmenü und den Alert auf `/account`; nach der Freigabe des letzten
  Eintrags verschwinden beide; ein einfaches Mitglied sieht keines von beidem.

## Risiken

- Der Zähler steht im Render-Pfad jeder Seite. Der Abbruch vor der ersten
  Abfrage für Nicht-Vorstände ist deshalb nicht Optimierung, sondern Bedingung —
  er gehört in den Test, nicht nur in den Code.
- `countPendingApprovals` dupliziert die Sichtbarkeitslogik von
  `listPendingMembers` und `listOpenGroupChanges`. Läuft eine der beiden Regeln
  künftig auseinander, zeigt der Zähler etwas anderes als die Liste dahinter.
  Gegenmittel: die gemeinsamen Prädikate bleiben die vorhandenen internen Helfer,
  und der Integrationstest prüft Zähler und Liste auf demselben Datenstand.
- `toBlob` mit `image/webp` ist in allen aktuellen Zielbrowsern verfügbar. Liefert
  ein Browser `null`, bricht der Upload mit sichtbarer Fehlermeldung ab, statt
  ein unzugeschnittenes Bild zu senden.

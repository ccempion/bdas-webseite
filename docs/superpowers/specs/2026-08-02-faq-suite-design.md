# FAQ-Suite — Design-Spec

**Ticket:** #133 — Tutorials und FAQ Page für Vorstände
**Branch:** `feat/133-faq-tutorials-vorstaende`
**Datum:** 2026-08-02
**Status:** Freigegeben (Iteration 1: nur FAQ, keine bebilderten Tutorials)

---

## 1. Ziel

Eine rollen-bewusste FAQ-Seite unter `/faq`, erreichbar über einen klar
sichtbaren Button für angemeldete Mitglieder. Sie erklärt die Funktionen der
Plattform, getrennt nach den vier Bereichen **Allgemein**, **Bundesvorstand**,
**Vorstand** und **Mitglieder**.

Nicht-Ziele dieser Iteration: bebilderte Schritt-für-Schritt-Tutorials,
Screenshots, ein UI-Editor für die Inhalte. Diese kommen als Folge-Ticket.

## 2. Rollen-Mapping (aus dem Code, nicht erfunden)

Die im Ticket genannten Vorstand-Unterrollen bilden reale Role-Grants ab:

| Ticket-Begriff     | Role-Grant (`@bdas/auth` `Role`) | Quelle    |
| ------------------ | -------------------------------- | --------- |
| LEAD               | `local_board_lead`               | ADR 0013  |
| Vorstand           | `local_board`                    | Spec §4   |
| Event Organisator  | `event_organizer`                | ADR 0017  |
| Seiten Editor      | `page_editor`                    | ADR 0026  |
| Bundesvorstand     | `federal_board`                  | Spec §4   |
| Mitglied           | `member`                         | Spec §4   |
| Alumni             | `alumnus`                        | Spec §4   |

## 3. Architektur-Entscheidung: kein neues Modul

Die FAQ ist redaktioneller, selten geänderter Inhalt, den kein anderes Modul
liest oder schreibt. Ein DB-gestütztes Modul (Tabellen, Migrations,
Postgres-Integrationstests nach CLAUDE.md §5) wäre unverhältnismäßig. Der Inhalt
lebt daher als **typisierter statischer Content in `apps/web`**. Es entsteht kein
Business-State und keine Cross-Modul-Tabelle → die Acht Regeln bleiben unberührt,
keine ADR nötig (kein Stack-Substitut).

## 4. Route, Auth, Feature-Flag

- Neue Route `apps/web/app/faq/page.tsx` unter `/faq`.
- Server Component. Auth-Gate über `loadCurrentMember()` aus
  `apps/web/app/_dashboard/session.ts` (liefert `CurrentMember` inkl. `grants`).
  `null` → `redirect("/anmelden")`. Jedes angemeldete Mitglied darf rein; **kein**
  Board-Grant nötig.
- Feature-Flag `faq` wird zu `core/feature-flags` `FLAGS` ergänzt. Sichtbarkeit
  läuft über den Helper `apps/web/lib/faq/enabled.ts` → `faqEnabled()` =
  `isFlagOn("faq") || VERCEL_ENV === "preview"`. Heißt: in **Production** hinterm
  Flag (Default OFF, mergebar), auf **Vercel-Preview-Deployments automatisch an**,
  damit der Branch unter seiner Preview-URL reviewbar ist, bevor das Flag in Prod
  gesetzt wird. Route und beide Footer-Links nutzen `faqEnabled()`.
- `/FAQ` (Groß-Schreibweise aus dem Ticket) wird per Redirect in
  `apps/web/next.config.mjs` auf das kanonische `/faq` umgeleitet.

## 5. Navigation (der „Button") — im Footer

Entscheidung (mit dem Nutzer abgestimmt): der Link lebt im **Footer**, nicht im
Header. Die Plattform hat bereits eine „Seiten"-Spalte im Footer (z. B.
`/ueber-uns`, `/unsere-arbeit`) — dort fügt sich die FAQ natürlich ein.

- `apps/web/app/_public/PublicFooter.tsx`: FAQ-Link in der `<nav aria-label="Seiten">`-
  Spalte, gated mit `isFlagOn("faq")` (gleiche Konvention wie die `events`/`groups`-
  Links dort).
- `apps/web/components/SiteFooter.tsx`: FAQ-Link neben Datenschutz/Impressum, gated
  mit `isFlagOn("faq")`, damit die App-Shell-Variante ihn ebenfalls zeigt.
- Der Link ist für alle sichtbar; die `/faq`-Route erzwingt selbst die Anmeldung
  (Gast → `/anmelden`). Kein Header-Pill.

## 6. Content-Modell

Dateien unter `apps/web/content/faq/`:

```
types.ts          # FaqBlock, FaqEntry, FaqSubgroup, FaqSection, SectionKey
allgemein.ts
bundesvorstand.ts
vorstand.ts       # nutzt subgroups: LEAD / Vorstand / Event Organisator / Seiten Editor
mitglieder.ts
index.ts          # SECTIONS: ReadonlyArray<FaqSection>
```

Modell (Skizze):

```ts
type SectionKey = "allgemein" | "bundesvorstand" | "vorstand" | "mitglieder";

type FaqBlock =
  | { kind: "p"; text: string }
  | { kind: "steps"; items: string[] }
  | { kind: "link"; href: string; label: string };

type FaqEntry = { id: string; question: string; body: FaqBlock[] };

type FaqSubgroup = { id: string; title: string; entries: FaqEntry[] };

type FaqSection = {
  key: SectionKey;
  title: string;
  intro?: string;
  entries: FaqEntry[];        // für Bereiche ohne Unterrollen
  subgroups?: FaqSubgroup[];  // nur „vorstand"
};
```

Regeln: kein Roh-HTML (nur die drei `FaqBlock`-Typen), keine Inline-Hex/Radii/
Schatten — alles über Design-System-Tokens/Klassen. Deep-Links zeigen auf echte
Routen (`/gruppe/[slug]/events`, `/federal/roles`, …; Slug-abhängige Links werden
generisch formuliert bzw. auf die Scope-Landing verlinkt).

## 7. Rollen-bewusste Reihenfolge (die einzige echte Logik → getestet)

Reine Funktion `orderSections(grants, allSections)` in
`apps/web/lib/faq/order.ts`:

- Bestimmt aus `grants` die **primäre Sektion** und ob sie **default-open** ist.
- Priorität (höchste zuerst): `federal_board` → Bundesvorstand; irgendein
  `local_board_lead | local_board | event_organizer | page_editor` → Vorstand;
  sonst → Mitglieder. Allgemein steht immer zuletzt.
- Rückgabe: `{ key, defaultOpen }[]` in Render-Reihenfolge. Die primäre Sektion
  steht oben und ist offen; Mitglieder + Allgemein sind für reine Mitglieder
  offen, sonst eingeklappt.
- Bei mehreren Grants (z. B. LEAD + Bundesvorstand): höchste Priorität gewinnt für
  die Position; alle Bereiche werden dennoch gerendert.

Innerhalb der Vorstand-Sektion werden alle vier Unterrollen-Subgroups gezeigt; die
zur konkreten Rolle passende Subgroup wird hervorgehoben/aufgeklappt (aus `grants`
abgeleitet, ebenfalls in `order.ts` als reine Funktion).

## 8. Rendering

- `app/faq/page.tsx` (Server): lädt `me`, ruft `orderSections`, rendert die
  Sektionen in der berechneten Reihenfolge.
- `app/faq/FaqSection.tsx` / `FaqAccordion.tsx` (präsentational): jede `FaqEntry`
  als `<details className="bdas-accordion">` mit `<summary>` (Frage) und Body aus
  `FaqBlock`s. `defaultOpen` steuert das `open`-Attribut der Sektions-Ebene.
- Deep-Links als `next/link` mit `PILL`- bzw. Button-Klassen.

## 9. Tests

- **Vitest** (`apps/web/lib/faq/order.test.ts`): Reihenfolge/`defaultOpen` für
  jede Rollenkonstellation — reines Mitglied, `local_board`, `local_board_lead`,
  `event_organizer`, `page_editor`, `federal_board`, Mehrfach-Grant
  (LEAD+Federal), leere Grants. Subgroup-Hervorhebung je Vorstand-Unterrolle.
- **E2E-Smoke** (Playwright): `/faq` für Gast → Redirect `/anmelden`; für
  angemeldetes Mitglied → 200 + FAQ-Button im Header sichtbar; primäre Sektion
  offen.

## 10. Content-Umfang (wird gemeinsam abgearbeitet)

Gerüst zuerst (Route, Auth, Nav, Typen, Renderer, Tests), dann Inhalt Bereich für
Bereich — abgeleitet aus der bestätigten Funktionalitäts-Inventur:

- **Allgemein:** Plattform-Zweck, Public vs. Dashboard, Registrierung/Login/
  Verifizierung, Rollenmodell (Basis + scoped grants), Scope-Switcher,
  Zugriffskontrolle, Account/E-Mail-Präferenzen.
- **Bundesvorstand:** Overview/Kennzahlen, Mitglieder-/Events-/Gruppen-Tabellen,
  Rollenvergabe + Audit, „Ohne Gruppe"-Pool, Broadcasts, Payments, Dateien.
- **Vorstand → Vorstand:** Overview, Roster (Pending/Gruppenwechsel entscheiden),
  Events, Join-Policy, Gruppen-Broadcast, Handover, Projekte, Dateien; Grenzen
  (keine Seitenbearbeitung, keine Rollenvergabe).
- **Vorstand → LEAD:** zusätzlich Rollenvergabe in der Gruppe, Delegierte
  ernennen (event_organizer/page_editor), Gruppenseite bearbeiten.
- **Vorstand → Event Organisator:** nur Events der Gruppe.
- **Vorstand → Seiten Editor:** nur die öffentliche Gruppenseite.
- **Mitglieder:** Profil, Event An-/Abmeldung + Warteliste, Verzeichnis,
  Ankündigungen, Gruppenwechsel, Dateien, Beiträge/Beitrittsgebühr, Blog/Projekte,
  Alumni-Status.

## 11. Betroffene Dateien

Neu: `apps/web/app/faq/page.tsx`, `apps/web/app/faq/FaqSection.tsx`,
`apps/web/app/faq/FaqAccordion.tsx`, `apps/web/content/faq/*`,
`apps/web/lib/faq/order.ts` (+ `order.test.ts`), E2E-Spec.
Geändert: `core/feature-flags/src/index.ts` (+`"faq"`),
`apps/web/app/_public/PublicFooter.tsx` + `apps/web/components/SiteFooter.tsx`
(FAQ-Link, flag-gated).

# Editor-Realismus — Design

**Date:** 2026-08-10
**Status:** Approved (brainstormed with product owner)
**Scope:** Make the Puck canvas look like the real page: empty blocks become visible, and the public header and footer frame the content column in the editor. Touches `apps/web/app/_content/` and `apps/web/app/_public/`. No `content` module, schema, migration, or flag change.

**Puck version:** independent of the 0.23 upgrade. `PuckContext { isEditing, metadata }` is present in the currently-deployed 0.22.2, verified against its published `.d.ts`. This can land before or after `chore/puck-023-dnd`.

---

## 1. Context and decisions

Two problems make the editor feel unlike the page it edits.

**Empty blocks are invisible.** This is a live papercut, not only a polish item. `Bild` returns `<></>` when no image is chosen (`puck-config.tsx:208`) and `Button` returns `<></>` when the href is empty or unsafe (`:228`) — and `Button`'s `defaultProps.href` is `""`. **A freshly dropped Button renders nothing at all**: the board drags a block onto the page and sees no change, with nothing to indicate the drop worked. `Absatz`, `Fliesstext`, `PersonenRaster` and `Organigramm` are effectively invisible when empty for the same reason.

**The canvas has no page chrome.** `root.render` supplies only the centred content column, so the board edits a bare strip of blocks with no header or footer for context.

Decisions made during brainstorming:

- **`puck.isEditing` is the gate for both.** `root.render` receives the Puck context (`DefaultRootRenderProps = WithPuckProps<…>`, and `PuckContext` carries `isEditing`, `metadata`, `renderDropZone`, `dragRef`). Editor-only rendering therefore needs no feature flag and no separate config: `<Render>` simply never sees it.
- **Public rendering is untouched.** An empty `Button` still renders nothing to visitors — that is existing deliberate behaviour, not a bug to fix here.
- **The chrome shows the visitor's view,** not the logged-in board member's. The board is previewing a public page, so the visitor's header is what matters — and it needs no session or DB data, because `navItems({ isLoggedIn: false })` is a pure call.
- **`PublicHeader` cannot be rendered as-is.** It is an async Server Component (`_public/PublicHeader.tsx:55`) that hits the database via `loadCurrentMember`, `loadApprovalCounts` and `getGroup(getDb())`. Puck's canvas is a client tree inside an iframe. The data-loading and the markup must be separated.
- **Three PRs, not one** (CLAUDE.md §4). The shell refactor touches `_public/`, which is outside the content editor and deserves its own review.

## 2. Goals and non-goals

**Goals**

- Every block is visibly present in the editor immediately after it is dropped, empty or not.
- The editor canvas shows the real public header and footer around the content column.
- Public pages render exactly as they do today.

**Non-goals**

- No change to what visitors see, in any block, in any state.
- No interactive chrome in the canvas — the header and footer are decoration.
- No editing of header or footer content through Puck. They are chrome, not blocks, and therefore live in `root.render`, never in `components`.
- No board-member-specific chrome (Konto pill, approvals badge, Meine Gruppe).

## 3. Part 1 — visible empty blocks

One shared component, `BlockPlatzhalter`, so this is a single idiom rather than six ad-hoc boxes. Rendered only when `puck.isEditing`, by the six blocks that can render empty: `Bild`, `Button`, `Absatz`, `Fliesstext`, `PersonenRaster`, `Organigramm`.

Presentation: dashed outline, muted German label naming the block and what is missing (for example "Bild — noch kein Bild ausgewählt"). Built only from existing tokens — `border-bdas-soft`, `rounded-bdas`, `text-bdas-ink-muted` (CLAUDE.md §7).

Each block decides its own "empty" condition; that predicate is the unit-testable part.

## 4. Part 2 — header and footer in the canvas

**Split data from view.** Both shell components gain a pure, client-safe view:

- `PublicHeader` (async; unchanged responsibilities) renders `PublicHeaderView`
- `PublicFooter` renders `PublicFooterView`, with its two `isFlagOn` reads lifted to props

This is a pure refactor with no behaviour change on public pages, and the existing E2E specs guard it. `navItems` is already a pure, unit-tested function (`_public/nav-items.ts`), which is what makes the split small.

**Feed the canvas.** The only server-dependent value the visitor chrome needs is the pair of footer flags. The `/bearbeiten` server routes pass them to `PuckEditor`, which forwards them via `<Puck metadata={{ chrome: { events, groups } }}>`. `root.render` reads `puck.metadata.chrome`, calls `navItems({ isLoggedIn: false })` inline, and wraps the content column in the two views when `puck.isEditing`.

**Make the chrome inert.** It renders inside a `pointer-events-none`, `aria-hidden` wrapper. Without this, a stray click on a nav `<Link>` navigates the _iframe_ away and the board loses the editor.

## 5. Sequencing

| PR  | Content                                                            | Reviewable alone |
| --- | ------------------------------------------------------------------ | ---------------- |
| 1   | `BlockPlatzhalter` + the six empty-state predicates                | yes              |
| 2   | `PublicHeaderView` / `PublicFooterView` extraction (pure refactor) | yes              |
| 3   | `metadata` plumbing + chrome in `root.render`                      | depends on 2     |

PR 1 is independent of 2 and 3 and can land first.

## 6. Testing

**Unit** (node env, `renderToStaticMarkup`):

- Each of the six empty-state predicates, for empty and non-empty props.
- `BlockPlatzhalter` renders under `isEditing: true` and is absent under `isEditing: false` — asserted per block, since this is the property that protects the public page.
- `PublicHeaderView` / `PublicFooterView` render the expected nav entries for the visitor case, and the footer respects both flag props.

**Regression:** the existing `content-pages` and `group-pages` E2E specs already drive the editor and assert public output; PR 2 must leave them green with no edits. If a spec needs changing, the refactor was not behaviour-preserving.

**E2E addition:** after PR 3, assert the editor canvas contains the header landmark and that the published public page still renders exactly one header (the layout's), not two.

## 7. Risks

- **Double chrome.** If `isEditing` were ever true in `<Render>`, a visitor would see two headers. The per-block `isEditing: false` assertions in §6 cover the same property for placeholders; add the equivalent for chrome.
- **Iframe styling.** The chrome depends on the app's Tailwind reaching the Puck iframe. Existing blocks already render styled in the canvas, so this is expected to hold, but it should be confirmed visually rather than assumed.

## 8. Open questions

None.

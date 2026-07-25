# Editable Group Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Groups author their own public page (`/gruppen/[slug]`) in Puck; the group lead delegates editing via a new group-scoped `page_editor` role; upcoming group events render at the bottom of the page.

**Architecture:** Reuse the existing content module (ADR 0023) end-to-end. A new `page_editor` role rides the existing grant system (ADR 0007/0013). `savePage` gains an optional `scope: { groupId }`; the API routes resolve `gruppen/<slug>` → group and pass the scope, so the content module never imports groups. The public page keeps a fixed header (BDAS name + city — structurally not editable), fixed contact card, Puck content in between, events at the bottom.

**Tech Stack:** Next.js 14 App Router, Drizzle, Puck (`@puckeditor/core` ^0.22), vitest + Docker Postgres, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-18-editable-group-pages-design.md`

## Global Constraints

- CLAUDE.md §1 modular rules: content module never imports `@bdas/groups` or `@bdas/members`; cross-module access only through `index.ts` surfaces.
- Design tokens only — no ad-hoc hex/radius/shadow/duration. Use existing `bdas-*` Tailwind classes.
- All member/public-facing strings German (spec §22).
- Save = live, no drafts (ADR 0023).
- No new module, no new feature flag: group-page surfaces gate on `groups` + `content` (events section additionally on `events`).
- Migrations: append-only; members CHECK domain widens via drop+recreate (shape established in `0003_local_board_lead.sql`).
- Module tests run against real Postgres (`describeIfDb` pattern); no DB mocks.
- Working agreement: this branch (`48-gruppen-…`) is one PR; `/security-review` required before merge (touches authorization).

---

### Task 1: `page_editor` role — domain layer

**Files:**

- Modify: `modules/auth/src/sso.ts:19-25` (Role union)
- Create: `modules/members/migrations/0007_page_editor.sql`
- Modify: `modules/members/src/test-db.ts` (migration list)
- Modify: `modules/members/src/roles.ts` (ALL_ROLES, new helper)
- Modify: `modules/members/src/services/roles.ts` (scope + grant rules)
- Modify: `modules/members/src/index.ts` (export)
- Create: `modules/members/src/roles.unit.test.ts`
- Modify: `modules/members/src/index.test.ts` (integration tests)

**Interfaces:**

- Produces: `Role` now includes `"page_editor"`; `canEditGroupPage(grants: ReadonlyArray<Grant>, groupId: string): boolean` exported from `@bdas/members`; `grantRole/revokeRole` accept `page_editor` (lead-delegable, group-scoped).

- [ ] **Step 1: Write the failing pure test**

Create `modules/members/src/roles.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Grant } from "./types";

import { canEditGroupPage } from "./roles";

const g = (role: string, groupId: string | null): Grant => ({ role, groupId }) as Grant;

describe("canEditGroupPage", () => {
  it("federal board edits every group page", () => {
    expect(canEditGroupPage([g("federal_board", null)], "grp_a")).toBe(true);
  });

  it("lead and page_editor edit their own group only", () => {
    expect(canEditGroupPage([g("local_board_lead", "grp_a")], "grp_a")).toBe(true);
    expect(canEditGroupPage([g("page_editor", "grp_a")], "grp_a")).toBe(true);
    expect(canEditGroupPage([g("local_board_lead", "grp_b")], "grp_a")).toBe(false);
    expect(canEditGroupPage([g("page_editor", "grp_b")], "grp_a")).toBe(false);
  });

  it("plain local_board and member do not edit", () => {
    expect(canEditGroupPage([g("local_board", "grp_a")], "grp_a")).toBe(false);
    expect(canEditGroupPage([g("member", null)], "grp_a")).toBe(false);
    expect(canEditGroupPage([], "grp_a")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/members exec vitest run src/roles.unit.test.ts`
Expected: FAIL — `canEditGroupPage` is not exported.

- [ ] **Step 3: Implement the domain change**

In `modules/auth/src/sso.ts`, extend the union:

```ts
export type Role =
  | "member"
  | "local_board"
  | "local_board_lead"
  | "federal_board"
  | "alumnus"
  | "event_organizer"
  | "page_editor";
```

Create `modules/members/migrations/0007_page_editor.sql`:

```sql
-- Members module — add the `page_editor` role to the grant domain (ADR 0025).
-- Group-scoped: a per-group content delegate for the public group page
-- ("local_board restricted to the page surface"). Additive; the CHECK domain
-- widens via the drop+recreate shape established in 0003. No backfill.
ALTER TABLE member_role_grants
  DROP CONSTRAINT member_role_grants_role_check;

ALTER TABLE member_role_grants
  ADD CONSTRAINT member_role_grants_role_check
  CHECK (role IN ('member', 'local_board', 'local_board_lead', 'federal_board', 'alumnus', 'event_organizer', 'page_editor'));
```

In `modules/members/src/test-db.ts`, append to `MEMBERS_TEST_MIGRATIONS`:

```ts
  ["..", "migrations", "0007_page_editor.sql"],
```

In `modules/members/src/roles.ts`: add `"page_editor"` to `ALL_ROLES`, and below `canGrantLocalBoard` add:

```ts
/**
 * May the actor edit the group's public content page (ADR 0025)? Federal board
 * → any group. A `local_board_lead` or `page_editor` → only the group its
 * grant is scoped to. Plain `local_board` does NOT edit — the lead delegates
 * explicitly via `page_editor`.
 */
export function canEditGroupPage(grants: ReadonlyArray<Grant>, groupId: string): boolean {
  if (isFederalBoard(grants)) return true;
  return grants.some(
    (g) => (g.role === "local_board_lead" || g.role === "page_editor") && g.groupId === groupId,
  );
}
```

In `modules/members/src/services/roles.ts`:

- `requireCanGrant`: change the first condition to
  `if (role === "local_board" || role === "event_organizer" || role === "page_editor") {`
- `requireValidScope`: add `page_editor` to the group-scoped list:
  `(role === "local_board" || role === "local_board_lead" || role === "event_organizer" || role === "page_editor") && groupId === null`
- Update both functions' doc comments to mention `page_editor` (ADR 0025).

In `modules/members/src/index.ts`, extend the roles re-export:

```ts
export {
  canTransition,
  effectiveGrants,
  isRole,
  isFederalBoard,
  canManageGroup,
  canGrantLocalBoard,
  canEditGroupPage,
  canDecideJoinRequest,
} from "./roles";
```

- [ ] **Step 4: Run pure test to verify it passes**

Run: `pnpm --filter @bdas/members exec vitest run src/roles.unit.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing integration tests**

In `modules/members/src/index.test.ts`, next to the existing `event_organizer` tests (~line 548), add:

```ts
it("a lead may grant/revoke page_editor scoped to its group (ADR 0025)", async () => {
  await createGroup("grp_a", "aachen");
  await createUser("usr_pe", "pe@example.de");
  const m = await createProfile(t.db, {
    userId: "usr_pe",
    firstName: "P",
    lastName: "x",
    primaryGroupId: "grp_a",
  });
  await approveMember(t.db, m.id, BOARD);

  // page_editor is group-scoped: a null scope is rejected.
  await expect(grantRole(t.db, m.id, "page_editor", BOARD)).rejects.toMatchObject({
    code: "VALIDATION",
  });

  await grantRole(t.db, m.id, "page_editor", leadOf("usr_lead", "grp_a"), "grp_a");
  expect(await getGrants(t.db, m.id)).toContainEqual({ role: "page_editor", groupId: "grp_a" });

  await revokeRole(t.db, m.id, "page_editor", leadOf("usr_lead", "grp_a"), "grp_a");
  expect(await getGrants(t.db, m.id)).not.toContainEqual({
    role: "page_editor",
    groupId: "grp_a",
  });
});

it("a plain local_board member may NOT grant page_editor; nor may a foreign lead", async () => {
  await createGroup("grp_a", "aachen");
  await createUser("usr_pe2", "pe2@example.de");
  const m = await createProfile(t.db, {
    userId: "usr_pe2",
    firstName: "P",
    lastName: "y",
    primaryGroupId: "grp_a",
  });
  await approveMember(t.db, m.id, BOARD);

  await expect(
    grantRole(t.db, m.id, "page_editor", localBoardOf("usr_lb", "grp_a"), "grp_a"),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    grantRole(t.db, m.id, "page_editor", leadOf("usr_lead_b", "grp_b"), "grp_a"),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
```

(`createGroup`, `createUser`, `createProfile`, `approveMember`, `BOARD`, `leadOf`, `localBoardOf`, `getGrants` all already exist in this file — mirror the adjacent `event_organizer` tests.)

- [ ] **Step 6: Run integration tests**

Run: `pnpm --filter @bdas/members test`
Expected: PASS (requires local Docker Postgres per repo convention; skips if unreachable — in that case run in CI).

- [ ] **Step 7: Commit**

```bash
git add modules/auth/src/sso.ts modules/members
git commit -m "feat(members): page_editor role — group-scoped, lead-delegable (ADR 0025)"
```

---

### Task 2: Content module — scope-aware `savePage`

**Files:**

- Modify: `modules/content/src/types.ts`
- Modify: `modules/content/src/services/pages.ts`
- Modify: `modules/content/src/index.ts`
- Modify: `modules/content/src/index.test.ts`

**Interfaces:**

- Consumes: nothing new (grant check runs on the `ActorGrant[]` the caller passes).
- Produces: `savePage(db, { slug, data, actor, scope? })` with `scope?: SaveScope`; `export type SaveScope = { readonly groupId: string }` from `@bdas/content`.

- [ ] **Step 1: Write the failing tests**

In `modules/content/src/index.test.ts`, add actors next to `FEDERAL`/`PLAIN`:

```ts
const scoped = (role: string, groupId: string): ContentActor => ({
  userId: `usr_${role}_${groupId}`,
  grants: [{ role, groupId }],
});
```

Add a describe block after the existing one:

```ts
describeIfDb("group-scoped saves (ADR 0025)", () => {
  let t: TestDb;
  const GROUP_SLUG = "gruppen/aachen";
  const SCOPE = { groupId: "grp_aachen" };

  beforeEach(async () => {
    t = await setupContentDb();
    resetEventBus();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("lead, page_editor, and federal may save a scoped page", async () => {
    for (const actor of [
      scoped("local_board_lead", "grp_aachen"),
      scoped("page_editor", "grp_aachen"),
      FEDERAL,
    ]) {
      await savePage(t.db, { slug: GROUP_SLUG, data: DOC, actor, scope: SCOPE });
    }
    expect((await getPage(t.db, GROUP_SLUG))?.data).toEqual(DOC);
  });

  it("plain local_board and foreign-group grants are rejected", async () => {
    for (const actor of [
      scoped("local_board", "grp_aachen"),
      scoped("page_editor", "grp_koeln"),
      scoped("local_board_lead", "grp_koeln"),
      PLAIN,
    ]) {
      await expect(
        savePage(t.db, { slug: GROUP_SLUG, data: DOC, actor, scope: SCOPE }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(await getPage(t.db, GROUP_SLUG)).toBeNull();
  });

  it("an unscoped save stays federal-only even for a lead", async () => {
    await expect(
      savePage(t.db, { slug: SLUG, data: DOC, actor: scoped("local_board_lead", "grp_aachen") }),
    ).rejects.toThrow(/Bundesvorstand/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/content test`
Expected: FAIL — `scope` is not an accepted input / FORBIDDEN thrown for all scoped actors.

- [ ] **Step 3: Implement**

In `modules/content/src/types.ts`, after `ContentActor`:

```ts
/** Scope of a group-owned page (ADR 0025). The caller (route layer) resolves
 *  the slug to a group; the module only checks grants against the id. */
export type SaveScope = {
  readonly groupId: string;
};
```

In `modules/content/src/services/pages.ts`, import `SaveScope` and replace the federal-only check in `savePage`:

```ts
export async function savePage(
  db: Db,
  input: { slug: string; data: unknown; actor: ContentActor; scope?: SaveScope },
): Promise<ContentPage> {
  const scope = input.scope;
  if (scope) {
    const may = input.actor.grants.some(
      (g) =>
        g.role === "federal_board" ||
        ((g.role === "local_board_lead" || g.role === "page_editor") &&
          g.groupId === scope.groupId),
    );
    if (!may) {
      throw new ForbiddenError("Keine Berechtigung, diese Gruppenseite zu bearbeiten.");
    }
  } else if (!input.actor.grants.some((g) => g.role === "federal_board")) {
    throw new ForbiddenError("Nur der Bundesvorstand darf Seiten bearbeiten.");
  }
  // …rest unchanged (slug/zod/size validation, upsert, event).
```

In `modules/content/src/index.ts`, add `SaveScope` to the type exports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/content test`
Expected: PASS (all pre-existing tests too — unscoped behavior unchanged).

- [ ] **Step 5: Commit**

```bash
git add modules/content
git commit -m "feat(content): scope-aware savePage — group pages editable by lead/page_editor (ADR 0025)"
```

---

### Task 3: Routes — group resolution for save + upload

**Files:**

- Create: `apps/web/lib/content-scope.ts`
- Create: `apps/web/lib/content-scope.test.ts`
- Modify: `apps/web/app/api/content/pages/[...slug]/route.ts`
- Modify: `apps/web/app/api/content/upload-url/route.ts`

**Interfaces:**

- Consumes: `savePage(..., scope?)` and `SaveScope` (Task 2); `canEditGroupPage` (Task 1); `getGroupBySlug(db, slug)` from `@bdas/groups`.
- Produces: `groupPageSlug(contentSlug: string): string | null` in `apps/web/lib/content-scope.ts`; upload route authorizes group editors when the request body's `slug` is a group-page slug.

- [ ] **Step 1: Write the failing helper test**

Create `apps/web/lib/content-scope.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { groupPageSlug } from "./content-scope";

describe("groupPageSlug", () => {
  it("extracts the group slug from a group content slug", () => {
    expect(groupPageSlug("gruppen/aachen")).toBe("aachen");
    expect(groupPageSlug("gruppen/koeln-sued")).toBe("koeln-sued");
  });

  it("returns null for federal pages and nested paths", () => {
    expect(groupPageSlug("impressum")).toBeNull();
    expect(groupPageSlug("ueber-uns/bundessprecherinnenrat")).toBeNull();
    expect(groupPageSlug("gruppen/aachen/extra")).toBeNull();
    expect(groupPageSlug("gruppen/")).toBeNull();
    expect(groupPageSlug("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run lib/content-scope.test.ts`
(Use the actual workspace name from `apps/web/package.json` if it differs from `web`.)
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement helper**

Create `apps/web/lib/content-scope.ts`:

```ts
const GROUP_PAGE_RE = /^gruppen\/([a-z0-9-]+)$/;

/** The group slug a content slug belongs to (`gruppen/<slug>`), or null for
 *  federal pages. Group pages are authorized per group (ADR 0025). */
export function groupPageSlug(contentSlug: string): string | null {
  return GROUP_PAGE_RE.exec(contentSlug)?.[1] ?? null;
}
```

Run: `pnpm --filter web exec vitest run lib/content-scope.test.ts` — PASS.

- [ ] **Step 4: Wire the PUT route**

In `apps/web/app/api/content/pages/[...slug]/route.ts`, add imports:

```ts
import { getGroupBySlug } from "@bdas/groups";
import type { SaveScope } from "@bdas/content";
import { groupPageSlug } from "../../../../../lib/content-scope";
```

Between the member load and the body parse, resolve the scope:

```ts
const slugPath = params.slug.join("/");
const gSlug = groupPageSlug(slugPath);
let scope: SaveScope | undefined;
if (gSlug !== null) {
  if (!isFlagOn("groups")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });
  const group = await getGroupBySlug(db, gSlug);
  if (!group || group.status === "archived") {
    return Response.json({ error: "Gruppe nicht gefunden." }, { status: 404 });
  }
  scope = { groupId: group.id };
}
```

and pass it through:

```ts
const page = await savePage(db, {
  slug: slugPath,
  data: body.data,
  actor: { userId: me.user.id, grants: me.grants },
  scope,
});
```

- [ ] **Step 5: Wire the upload route**

In `apps/web/app/api/content/upload-url/route.ts`: parse the body **before** the authorization check, then authorize per scope. Replace the section from `const me = await getCurrentMember(...)` down to the storage-key computation with:

```ts
const me = await getCurrentMember(getDb(), session);
if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });

const body = (await req.json().catch(() => null)) as {
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  slug?: string;
} | null;

const gSlug = groupPageSlug(body?.slug ?? "");
if (gSlug !== null) {
  if (!isFlagOn("groups")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });
  const group = await getGroupBySlug(getDb(), gSlug);
  if (!group || group.status === "archived") {
    return Response.json({ error: "Gruppe nicht gefunden." }, { status: 404 });
  }
  if (!canEditGroupPage(me.grants, group.id)) {
    return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
  }
} else if (!isFederalBoard(me.grants)) {
  return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
}

if (!body?.mimeType || !ALLOWED.has(body.mimeType)) {
  return Response.json({ error: "Nur Bilddateien (JPG, PNG, WebP, AVIF)." }, { status: 422 });
}
if (!body.sizeBytes || body.sizeBytes <= 0 || body.sizeBytes > MAX_BYTES) {
  return Response.json({ error: "Datei zu groß (max. 10 MB)." }, { status: 422 });
}
```

Imports: add `canEditGroupPage` to the `@bdas/members` import, `getGroupBySlug` from `@bdas/groups`, `groupPageSlug` from `../../../../lib/content-scope`. The storage-key code below stays unchanged (it already prefixes with `body.slug`).

- [ ] **Step 6: Verify**

Run: `pnpm --filter web exec vitest run` (route tests incl. the existing `upload-url/route.test.ts` — the anonymous-401 behavior is unchanged) and `pnpm --filter web typecheck` (or the repo's typecheck script).
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/content-scope.ts apps/web/lib/content-scope.test.ts apps/web/app/api/content
git commit -m "feat(web): group-scoped authorization for content save + uploads"
```

---

### Task 4: Puck palette — Bild block, generalized Rolle label, slug-aware uploads

**Files:**

- Create: `apps/web/app/_content/content-slug-context.ts`
- Modify: `apps/web/app/_content/PuckEditor.tsx`
- Modify: `apps/web/app/_content/FotoField.tsx`
- Modify: `apps/web/app/_content/puck-config.tsx`
- Modify: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: upload route accepting `slug` in the body (Task 3).
- Produces: `Bild` block `{ bild: string; alt: string; unterschrift: string }` in `puckConfig`; `ContentSlugContext` (React context, default `""`).

- [ ] **Step 1: Update the failing config test**

In `apps/web/app/_content/puck-config.test.ts`: change the first assertion to

```ts
expect(Object.keys(puckConfig.components).sort()).toEqual([
  "Absatz",
  "Bild",
  "PersonenRaster",
  "Ueberschrift",
]);
```

and add:

```ts
it("Bild carries upload, alt text, and optional caption", () => {
  const bild = puckConfig.components.Bild;
  expect(bild).toBeDefined();
  expect(Object.keys(bild?.fields ?? {}).sort()).toEqual(["alt", "bild", "unterschrift"]);
});

it("PersonenRaster's rolle label is generic (not BSR-specific)", () => {
  const personen = puckConfig.components.PersonenRaster?.fields?.personen;
  if (personen?.type !== "array") throw new Error("personen must be an array field");
  expect(personen.arrayFields.rolle?.label).toBe("Rolle");
});
```

Run: `pnpm --filter web exec vitest run app/_content/puck-config.test.ts`
Expected: FAIL (no `Bild` block, label still "Rolle im BSR").

- [ ] **Step 2: Implement the context + FotoField slug**

Create `apps/web/app/_content/content-slug-context.ts`:

```ts
"use client";

import { createContext } from "react";

/** The content slug being edited. FotoField sends it with upload requests so
 *  the upload route can authorize group editors (ADR 0025). */
export const ContentSlugContext = createContext<string>("");
```

In `apps/web/app/_content/PuckEditor.tsx`: import the context and wrap the returned tree:

```tsx
<ContentSlugContext.Provider value={slug}>
  <div className="min-h-screen">…unchanged…</div>
</ContentSlugContext.Provider>
```

In `apps/web/app/_content/FotoField.tsx`: `import { useContext } from "react";`, `import { ContentSlugContext } from "./content-slug-context";`; inside the component `const slug = useContext(ContentSlugContext);`; include it in the POST body:

```ts
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, slug }),
```

Update the FotoField doc comment: uploads are federal- or group-editor-gated per slug.

- [ ] **Step 3: Implement the Bild block + label**

In `apps/web/app/_content/puck-config.tsx`: extend `Blocks`:

```ts
type Blocks = {
  Ueberschrift: { text: string; ebene: "h2" | "h3" };
  Absatz: { text: string };
  Bild: { bild: string; alt: string; unterschrift: string };
  PersonenRaster: { personen: Person[] };
};
```

Add the component (after `Absatz`):

```tsx
    Bild: {
      label: "Bild",
      fields: {
        bild: {
          type: "custom",
          label: "Bild",
          render: ({ value, onChange }) => <FotoField value={value} onChange={onChange} />,
        },
        alt: { type: "text", label: "Alternativtext" },
        unterschrift: { type: "text", label: "Bildunterschrift (optional)" },
      },
      defaultProps: { bild: "", alt: "", unterschrift: "" },
      render: ({ bild, alt, unterschrift }) =>
        bild ? (
          <figure className="flex flex-col gap-2">
            <img src={bild} alt={alt} className="w-full rounded-bdas object-cover" />
            {unterschrift ? (
              <figcaption className="text-sm text-bdas-ink-muted">{unterschrift}</figcaption>
            ) : null}
          </figure>
        ) : null,
    },
```

Change the Personen-Raster field label: `rolle: { type: "text", label: "Rolle" },`

- [ ] **Step 4: Run tests**

Run: `pnpm --filter web exec vitest run app/_content/puck-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content
git commit -m "feat(web): Bild block, generic Rolle label, slug-aware FotoField uploads"
```

---

### Task 5: Public group page — Puck content, edit link, events

**Files:**

- Modify: `apps/web/app/gruppen/[slug]/page.tsx`

**Interfaces:**

- Consumes: `getPage` (`@bdas/content`), `puckConfig`, `canEditGroupPage` (`@bdas/members`), `listUpcomingEvents` + `viewerFrom` (`@bdas/events-module` / `apps/web/lib/event-viewer.ts`, signature `viewerFrom(me: CurrentMember | null): Viewer`), `loadCurrentMember` (`apps/web/app/_dashboard/session.ts`), `formatDateTime` (`apps/web/lib/format.ts`).

- [ ] **Step 1: Rewrite the page**

Replace `apps/web/app/gruppen/[slug]/page.tsx` with (keep `generateMetadata` as-is):

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { listUpcomingEvents } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { getGroupBySlug } from "@bdas/groups";
import { canEditGroupPage } from "@bdas/members";

import { puckConfig } from "../../_content/puck-config";
import { loadCurrentMember } from "../../_dashboard/session";
import { requireGroupsFlag } from "../../_groups/flag";
import { viewerFrom } from "../../../lib/event-viewer";
import { formatDateTime } from "../../../lib/format";

export const dynamic = "force-dynamic";
```

Body: after the existing `group` load + `notFound()` guard, add

```tsx
const contentOn = isFlagOn("content");
const me = contentOn ? await loadCurrentMember() : null;
const canEdit = me !== null && canEditGroupPage(me.grants, group.id);
const page = contentOn ? await getPage(getDb(), `gruppen/${group.slug}`) : null;
const upcoming = isFlagOn("events")
  ? await listUpcomingEvents(getDb(), viewerFrom(me), { groupId: group.id })
  : [];
```

Header block gains the edit link (same idiom as `apps/web/app/impressum/page.tsx`):

```tsx
<header className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
  <div className="flex flex-col gap-1">
    <p className="text-sm text-bdas-ink-muted">{group.city}</p>
    <h1 className="text-3xl font-semibold text-bdas-ink">{group.name}</h1>
  </div>
  {canEdit ? (
    <Link
      href={`/gruppen/${group.slug}/bearbeiten`}
      className="inline-flex shrink-0 items-center rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
    >
      Seite bearbeiten
    </Link>
  ) : null}
</header>
```

Keep the dormant alert and the Kontakt card unchanged. After the Kontakt card, render content then events:

```tsx
{
  page ? <Render config={puckConfig} data={page.data as Data} /> : null;
}

{
  upcoming.length > 0 ? (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-bdas-ink">Kommende Events</h2>
      {upcoming.map((e) => (
        <Link key={e.id} href={`/events/${e.id}`} className="block focus:outline-none">
          <Card className="p-5">
            <p className="text-sm text-bdas-ink-muted">{formatDateTime(e.startsAt)}</p>
            <h3 className="mt-1 text-lg font-semibold text-bdas-ink">{e.title}</h3>
            {e.location ? <p className="mt-1 text-sm text-bdas-ink-body">{e.location}</p> : null}
          </Card>
        </Link>
      ))}
    </section>
  ) : null;
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: clean. Then visually: `pnpm dev`, open `/gruppen/<seeded-slug>` — header, Kontakt, (empty content), no events section, no edit button when anonymous.

- [ ] **Step 3: Commit**

```bash
git add 'apps/web/app/gruppen/[slug]/page.tsx'
git commit -m "feat(web): group page renders Puck content, edit entry, upcoming events"
```

---

### Task 6: Editor route `/gruppen/[slug]/bearbeiten`

**Files:**

- Create: `apps/web/app/gruppen/[slug]/bearbeiten/page.tsx`

**Interfaces:**

- Consumes: `PuckEditor` (slug + initialData), `canEditGroupPage`, `getGroupBySlug`, `getPage`, `loadCurrentMember`, flags.

- [ ] **Step 1: Create the route**

`apps/web/app/gruppen/[slug]/bearbeiten/page.tsx` (BSR pattern, group-resolved):

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getGroupBySlug } from "@bdas/groups";
import { canEditGroupPage } from "@bdas/members";

import { PuckEditor } from "../../../_content/PuckEditor";
import { loadCurrentMember } from "../../../_dashboard/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gruppenseite bearbeiten",
  robots: { index: false },
};

/** Editor is lead/page_editor/federal-only; everyone else gets a 404
 *  (no existence leak, spec §6). */
export default async function GruppeBearbeitenPage({ params }: { params: { slug: string } }) {
  if (!isFlagOn("groups") || !isFlagOn("content")) notFound();

  const group = await getGroupBySlug(getDb(), params.slug);
  if (!group || group.status === "archived") notFound();

  const me = await loadCurrentMember();
  if (!me || !canEditGroupPage(me.grants, group.id)) notFound();

  const slug = `gruppen/${group.slug}`;
  const page = await getPage(getDb(), slug);
  const initialData = (page?.data ?? { root: { props: {} }, content: [] }) as Data;

  return <PuckEditor slug={slug} initialData={initialData} />;
}
```

Note: `PuckEditor` publishes to `/api/content/pages/gruppen/<slug>` and then routes to `/gruppen/<slug>` — both correct here with no changes.

- [ ] **Step 2: Verify**

`pnpm --filter web typecheck`. Then manually: as anonymous, `/gruppen/<slug>/bearbeiten` → 404.

- [ ] **Step 3: Commit**

```bash
git add 'apps/web/app/gruppen/[slug]/bearbeiten'
git commit -m "feat(web): Puck editor route for group pages, canEditGroupPage-gated"
```

---

### Task 7: Board UI wiring — grant option, roster label, sidebar entry

**Files:**

- Modify: `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx`
- Modify: `apps/web/app/(board)/_components/RoleRoster.tsx`
- Modify: `apps/web/app/(board)/nav.ts`

**Interfaces:**

- Consumes: `grantRole`/`revokeRole` accepting `page_editor` (Task 1).

- [ ] **Step 1: Grant option on the Vorstand page**

In `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx`, extend `roleOptions`:

```tsx
          roleOptions={[
            { role: "local_board", label: "Vorstand", groupId },
            { role: "event_organizer", label: "Organisator", groupId },
            { role: "page_editor", label: "Seiten-Editor", groupId },
          ]}
```

- [ ] **Step 2: Roster label**

In `apps/web/app/(board)/_components/RoleRoster.tsx`:

```ts
const ROLE_LABEL: Record<string, string> = {
  federal_board: "Bundesvorstand",
  local_board_lead: "Lead",
  local_board: "Vorstand",
  event_organizer: "Organisator",
  page_editor: "Seiten-Editor",
};
```

- [ ] **Step 3: Sidebar entry**

In `apps/web/app/(board)/nav.ts`, `groupNav`:

```ts
    { href: `${base}/vorstand`, label: "Vorstand" },
    { href: `${base}/profile`, label: "Profil" },
    { href: `/gruppen/${slug}`, label: "Öffentliche Seite" },
    { href: `${base}/files`, label: "Dateien" },
```

(The public page carries the edit entry for authorized viewers; the sidebar link leads there.)

- [ ] **Step 4: Verify + commit**

`pnpm --filter web typecheck && pnpm --filter web lint`

```bash
git add 'apps/web/app/(board)'
git commit -m "feat(web): Seiten-Editor grant option, roster label, sidebar link to public group page"
```

---

### Task 8: E2E — group page editing

**Files:**

- Modify: `e2e/helpers/db.ts` (add `seedRoleGrant` — check first whether an equivalent grant-seeding helper already exists further down the file; if so, reuse it)
- Create: `e2e/group-pages.e2e.ts`

- [ ] **Step 1: Grant-seeding helper**

In `e2e/helpers/db.ts` (if no equivalent exists):

```ts
/** Insert an active role grant for a member directly (bypasses the UI). */
export async function seedRoleGrant(
  memberId: string,
  role: string,
  groupId: string | null,
): Promise<void> {
  await sql`
    INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
    VALUES (${"mrg_e2e_" + rand()}, ${memberId}, ${role}, ${groupId}, 'usr_e2e_seed')`;
}
```

- [ ] **Step 2: Write the spec**

Create `e2e/group-pages.e2e.ts`:

```ts
/**
 * Editable group pages (spec 2026-07-18, ADR 0025): public view, editor
 * gating, lead entry into Puck. Requires BDAS_FLAG_GROUPS, BDAS_FLAG_CONTENT,
 * BDAS_FLAG_PUBLIC_SHELL and BDAS_FLAG_AUTH in the e2e env.
 */
import { expect, test } from "@playwright/test";

import { memberIdByEmail, seedGroup, seedRoleGrant, uniqueEmail, uniqueSlug } from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";

test("anonymous visitors see the group page without an edit entry; /bearbeiten is 404", async ({
  page,
}) => {
  const slug = uniqueSlug("e2e-seite");
  await seedGroup({ slug, name: "E2E Seitengruppe", city: "Teststadt" });

  await page.goto(`/gruppen/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "E2E Seitengruppe" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Seite bearbeiten" })).toHaveCount(0);

  const res = await page.goto(`/gruppen/${slug}/bearbeiten`);
  expect(res?.status()).toBe(404);
});

test("a member without page_editor gets no edit entry and a 404 on /bearbeiten", async ({
  page,
}) => {
  const slug = uniqueSlug("e2e-noedit");
  await seedGroup({ slug, name: "E2E Ohne Rechte", city: "Teststadt" });
  await registerVerifyLogin(page, {
    email: uniqueEmail("plainmember"),
    firstName: "Plain",
    lastName: "Member",
  });

  await page.goto(`/gruppen/${slug}`);
  await expect(page.getByRole("link", { name: "Seite bearbeiten" })).toHaveCount(0);
  const res = await page.goto(`/gruppen/${slug}/bearbeiten`);
  expect(res?.status()).toBe(404);
});

test("a page_editor reaches the Puck editor from the group page", async ({ page }) => {
  const slug = uniqueSlug("e2e-editor");
  const groupId = await seedGroup({ slug, name: "E2E Editorgruppe", city: "Teststadt" });
  const email = uniqueEmail("pageeditor");
  await registerVerifyLogin(page, { email, firstName: "Page", lastName: "Editor" });

  const memberId = await memberIdByEmail(email);
  expect(memberId).not.toBeNull();
  await seedRoleGrant(memberId as string, "page_editor", groupId);

  await page.goto(`/gruppen/${slug}`);
  await page.getByRole("link", { name: "Seite bearbeiten" }).click();
  // Puck chrome is English; Publish is a <span> behind the collapsed menu on
  // mobile viewports (same caveats as content-pages.e2e.ts).
  await page.getByRole("button", { name: "Toggle menu bar" }).click();
  await expect(page.getByText("Publish", { exact: true })).toBeVisible();
});
```

If `registerVerifyLogin`'s option shape differs (check `e2e/helpers/flows.ts`), match it — the content-pages spec is the reference.

- [ ] **Step 3: Run**

Run the repo's e2e command (see `.github/workflows/ci.yml` / `package.json`; typically `pnpm exec playwright test e2e/group-pages.e2e.ts` with the dev server + flags from the CI env).
Expected: 3 passing tests.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test(e2e): group page editing — public view, gating, editor entry"
```

---

### Task 9: ADR + READMEs

**Files:**

- Create: `docs/decisions/0025-group-page-editors.md`
- Modify: `modules/members/README.md` (roles table: `page_editor`, lead-delegable)
- Modify: `modules/content/README.md` (save-authorization: scoped saves)
- Modify: `modules/groups/README.md` (routes table: `/gruppen/[slug]` now renders Puck content + events; `/gruppen/[slug]/bearbeiten` editor)

- [ ] **Step 1: Write ADR 0025**

`docs/decisions/0025-group-page-editors.md`:

```markdown
# ADR 0025 — Group pages: page_editor role and scoped content saves

- **Status:** Accepted
- **Date:** 2026-07-18
- **Extends:** ADR 0013 (lead delegation), ADR 0023 (Puck content pages)

## Context

Local groups need to author their own public page (`/gruppen/[slug]`) without a
developer round-trip. The content module's save-authorization was federal-only;
the grant system already lets a `local_board_lead` delegate group-scoped roles
(`local_board`, `event_organizer` — ADR 0013).

## Decision

- New group-scoped role `page_editor`, grantable/revocable by federal board or
  the group's own `local_board_lead` (same delegation branch as
  `event_organizer`). Plain `local_board` does not edit — the lead delegates
  explicitly. Editing authority = `federal_board` ∨ (`local_board_lead` ∨
  `page_editor` scoped to the group) — `canEditGroupPage` in `@bdas/members`.
- `savePage` gains an optional `scope: { groupId }`. The route layer resolves
  `gruppen/<slug>` → group and passes the id; the content module checks the
  actor's grants against it and stays groups-agnostic. Unscoped saves remain
  federal-only. The `content-media` upload route authorizes the same way via
  the request's content slug.
- The page keeps a fixed server-rendered header (BDAS name + city) and contact
  card; only the section between them and the events list is Puck-authored.
  The group's name is therefore structurally not editable.

## Consequences

- A new editable page type costs one route pair + a `groupNav` entry; the
  content schema is unchanged (slug-keyed).
- Migration `members/0007_page_editor.sql` widens the role CHECK domain.
- The events section is live data (`listUpcomingEvents`), not authored content
  — groups cannot fabricate events on their page.
```

- [ ] **Step 2: Update the three READMEs**

One or two lines each, matching their existing table/list formats (roles list in members, authorization paragraph in content, routes table in groups — add `/gruppen/[slug]/bearbeiten` with "Editor. 404 unless lead/page_editor/federal (ADR 0025)").

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0025-group-page-editors.md modules/members/README.md modules/content/README.md modules/groups/README.md
git commit -m "docs: ADR 0025 — page_editor role and group-scoped content saves"
```

---

### Task 10: Full verification

- [ ] **Step 1: Workspace-wide checks**

Run: `pnpm -r typecheck && pnpm -r lint && pnpm -r test`
(Use the exact script names from the root `package.json`; module tests need the Docker Postgres from the repo's dev setup.)
Expected: all green.

- [ ] **Step 2: E2E suite**

Run the full e2e suite the way CI does (content-pages + group-pages + groups-public must all pass — the label change and page rewrite touch their surfaces).

- [ ] **Step 3: Live perspective check**

With the dev server running, use Playwright (browser tools) and the two logins from the team's data sheet to verify: (a) board perspective — Vorstand page shows the „Seiten-Editor" option, sidebar shows „Öffentliche Seite", granting the role works, editing + Publish round-trips and the public page shows the content; (b) member perspective — no edit entry, `/bearbeiten` 404s, events section renders when the group has an upcoming published event.

- [ ] **Step 4: Reviews**

Run `/code-review` on the branch. Remind the user to trigger `/security-review` (authorization changes) before merge — per CLAUDE.md §4 it is mandatory for auth-touching PRs.

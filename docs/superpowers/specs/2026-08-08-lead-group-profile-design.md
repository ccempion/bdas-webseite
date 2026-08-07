# Lead owns the group profile — design

Date: 2026-08-08
Status: approved (brainstorming session)
Issue: #62

## Goal

The lead of a Hochschulgruppe edits every piece of their group's own data
without a federal-board or developer round-trip: the structured master data
(name, city, contact, socials, location, banner image) on the board page
`/gruppe/<slug>/profil`, and the free-form public page body through the existing
Puck editor at `/gruppen/<slug>/bearbeiten`. The half-built federal surface
`/admin/gruppen` is removed rather than kept in parallel.

## Decisions made

| Question                                  | Decision                                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which fields the lead may edit            | name, city, contactEmail, instagramUrl, websiteUrl, location, imageKey. **Not** status (federal-only), **not** slug (immutable public URL)                       |
| Who reaches the profile page              | `requireLeadScope` — federal_board ∨ local_board_lead of that group. Plain `local_board` loses today's name/city/location edit (consistent with ADR 0026 §Decision) |
| Group image placement                     | 16:9 banner above the fixed server-rendered header of `/gruppen/<slug>`. Not on `/gruppen` list cards, not in the map popup                                       |
| Group image storage                       | Existing public `content-media` bucket via the existing `POST /api/content/upload-url` with `slug: "gruppen/<slug>"`. No new bucket, route, or env var           |
| Public page body editing                  | No new editor. Surface the existing `/gruppen/<slug>/bearbeiten` (Puck, ADR 0026) from the profile page                                                          |
| `/admin/gruppen`                          | Deleted outright. `(board)/federal/groups` already covers create + archive; every other field is now edited on the profile page                                  |
| Status switching (active/dormant/new)     | Loses its UI with no replacement. Accepted — rebuilt later (issue #62 comment: "Wir bauen das später nochmal")                                                   |
| Route spelling                            | `profile` → `profil`, matching the German dashboard routes (`bewerbungen`, `vorstand`) and the URL named in the issue                                            |

## 1. Data model (groups module)

Migration `modules/groups/migrations/0005_image_key.sql`:

```sql
ALTER TABLE groups ADD COLUMN image_key text;
```

The manifest entry `"groups"` in `infra/migrations/src/manifest.ts` is unchanged
— migrations inside a module run in filename order.

Module changes, all inside `modules/groups`:

- `schema.ts` — `imageKey: text("image_key")`.
- `types.ts` — `Group.imageKey: string | null`. `GroupSummary` is **not**
  widened: the banner is only read on the detail page, and `listGroups` feeds
  the public list and the map, which do not show it.
- `services/manage.ts` — `UpdateGroupInput` gains
  `imageKey: z.string().max(500).optional().nullable()`; `CreateGroupInput`
  inherits it via `.extend()`. `createGroup`/`updateGroup`/`rowToGroup`/`toGroup`
  carry it through.
- `services/get.ts`, `services/upsert.ts` — project/persist the new column.

The module stores an opaque storage key and never a URL: converting a key to a
public URL is `@bdas/storage`'s job, called from the app layer. This keeps
`groups` free of a storage dependency (CLAUDE.md §1 rule 2).

## 2. Routes

| Path                                  | Change                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `(board)/gruppe/[slug]/profile`       | renamed to `profil`; becomes the full master-data page                            |
| `(board)/nav.ts` `groupNav`           | `Profil` href → `/gruppe/<slug>/profil`                                           |
| `admin/gruppen/**`                    | deleted: `page.tsx`, `neu/page.tsx`, `[slug]/bearbeiten/page.tsx`, `GroupForm.tsx`, `ArchiveButton.tsx`, `actions.ts` |
| `/gruppen/[slug]`                     | renders the banner above the existing header when `group.imageKey` is set         |
| `/gruppen/[slug]/bearbeiten`          | unchanged; linked from the profile page                                           |

No redirect from `/gruppe/<slug>/profile` is added — the old path is reachable
only through the dashboard sidebar, which moves with it.

## 3. Profile page

`(board)/gruppe/[slug]/profil/page.tsx` gates with `requireLeadScope(params.slug)`,
loads the group, and renders two blocks:

1. `GroupProfileForm` — the seven editable fields.
2. A card linking to `/gruppen/<slug>/bearbeiten` ("Öffentliche Seite gestalten")
   and to `/gruppen/<slug>` ("Ansehen").

`(board)/_components/GroupProfileForm.tsx` grows from three inputs to:

- `name`, `city` (required text)
- `contactEmail` (type=email), `instagramUrl`, `websiteUrl` (type=url) — empty
  string submits as `null`
- `LocationPicker` (unchanged)
- `BannerField` (see §4)

Validation errors come from the module's zod schema through the action's error
string; the form shows one message under the submit button, as today.

`(board)/_components/group-profile-actions.ts` — `updateGroupProfileAction`
takes the widened input. The "merge stored admin-managed fields" workaround
shrinks to `status` alone: `contactEmail`/`instagramUrl`/`websiteUrl` are now
part of the submitted form, so re-reading them would overwrite the user's edit.
The archived-group guard and the `safeRevalidate` allowlist stay. Authorization
tightens from `canManageGroup ∨ canGrantLocalBoard` to `canGrantLocalBoard`
alone, matching the page gate — the action is a public endpoint and must not be
looser than the page that calls it.

## 4. Banner upload (drag & drop)

New client component `(board)/_components/BannerField.tsx`:

- Wraps `DropZone` (`app/_upload/DropZone.tsx`) with `accept={CONTENT_IMAGE}`
  and `onFile`, so a drop and the click path share one intake.
- The drop target is the 16:9 preview area itself (`aspect-[16/9] w-full`,
  min-height ~200px), not a thin strip — "ausreichend großes Fenster" from the
  issue. Empty state shows a dashed frame with "Bild hierher ziehen oder
  auswählen".
- Upload goes through the shared helper and reads back `{ storageKey, publicUrl }`;
  `publicUrl` is the optimistic preview, `storageKey` is what the form submits:

  ```ts
  await uploadImage("/api/content/upload-url", file, { slug: `gruppen/${slug}` });
  ```

- "Bild entfernen" sets `imageKey` to `null`. The orphaned object is left in the
  bucket — the same behaviour every other media surface has today; a sweeper is
  out of scope.

Nothing new is needed server-side. `POST /api/content/upload-url` already
authorizes `gruppen/<slug>` uploads with `canEditGroupPage` (federal ∨
local_board_lead ∨ page_editor), which is a superset of the profile page's gate,
and already enforces `CONTENT_IMAGE` (10 MB; JPEG/PNG/WebP/AVIF) as the
authoritative cap.

## 5. Public rendering

`apps/web/app/gruppen/[slug]/page.tsx`, above the existing `<header>` and inside
the same `breiteClass("schmal")` container:

```tsx
{group.imageKey ? (
  <img
    src={contentMediaPublicUrl(group.imageKey)}
    alt=""
    className="aspect-[16/9] w-full rounded-bdas object-cover"
  />
) : null}
```

`alt=""` is deliberate: the banner is decorative and the group name follows
immediately as an `<h1>`. ADR 0026's rule that the header is structurally fixed
and non-Puck is preserved — the banner is server-rendered chrome, not authored
content.

## 6. Authorization summary

| Actor                        | `/gruppe/<slug>/profil` | Banner upload | `/gruppen/<slug>/bearbeiten` |
| ---------------------------- | ----------------------- | ------------- | ---------------------------- |
| `federal_board`              | ✅                      | ✅            | ✅                           |
| `local_board_lead` (own)     | ✅                      | ✅            | ✅                           |
| `page_editor` (own)          | ❌                      | ✅            | ✅                           |
| `local_board` (own)          | ❌                      | ❌            | ❌                           |
| any of the above, other group| ❌                      | ❌            | ❌                           |

`page_editor` retaining upload access is pre-existing ADR 0026 behaviour for the
Puck editor and is not narrowed here.

## 7. Removal of `/admin/gruppen`

Deleted with no replacement route. Consequences:

- Creating a group keeps only name/city/slug (`CreateGroupForm` on
  `/federal/groups`); contact data and location are filled in afterwards on the
  group's profile page.
- Archiving keeps its button in `GroupsTable` on `/federal/groups`.
- Switching a group between `active`/`dormant`/`new` has **no UI**. `archiveGroup`
  is the only status writer left in the app.
- `apps/web/app/_public/nav-items.test.ts` asserts `/admin/gruppen` is absent
  from the public nav — the assertion stays valid and is left alone.

## 8. Tests

- `modules/groups/src/index.test.ts` (Docker Postgres, per CLAUDE.md §3): a
  group created with an `imageKey` reads it back; `updateGroup` sets and clears
  it; `imageKey` longer than 500 chars is a `ValidationError`.
- `apps/web/app/_upload/` unit coverage already exercises `intakeFiles`/
  `rejectReason`; `BannerField` adds no new intake logic and needs no new unit
  test beyond the action.
- `group-profile-actions` unit test: a `local_board`-only actor is rejected; a
  `local_board_lead` of another group is rejected; a lead of the own group
  writes all seven fields.
- `e2e/board.e2e.ts` and `e2e/group-map.e2e.ts`: the four `/admin/gruppen`
  navigations are rewritten against `/gruppe/<slug>/profil`, including the
  location flow that `group-map.e2e.ts` covers today.
- New e2e: a lead uploads a banner through the file input (`setInputFiles`, the
  path the existing upload specs drive) and the image appears on
  `/gruppen/<slug>`.

## 9. ADR

`docs/decisions/0032-lead-owns-group-profile.md` records: the lead-only gate on
group master data, the removal of `/admin/gruppen`, the loss of status
switching, and the reuse of the `content-media` bucket for group banners.

## Out of scope

- Rebuilding a federal group-administration surface.
- Any status/archive workflow change.
- Image cropping (`CropDialog` is profile-photo-specific) or server-side
  resizing.
- Orphaned-object cleanup in `content-media`.

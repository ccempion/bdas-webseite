# BDAS Digital Platform — Build Specification

> A modular specification for the BDAS member platform, written to be handed to an AI code-builder (Claude, Lovable, v0, Bolt, Cursor) one module at a time.
>
> **Read order for the AI:** Sections 1–6 are mandatory context for any prompt. Sections 7+ are per-module — paste only the module you are currently building, plus sections 1–6.

---

## 1. Project Context

The Bund der Alevitischen Studierenden in Deutschland (BDAS) is a federation of local Alevi student groups (Hochschulgruppen) at German universities, coordinated by a federal board (Bundesvorstand). Today the federation uses WordPress for public content and ad-hoc tools (WhatsApp, spreadsheets, personal initiative) for everything else. This causes recurring problems:

- Board handovers are not standardized — knowledge, roles, and processes are lost each cycle.
- Membership is informal: no central register, no verification, no continuity after graduation.
- Events live in WhatsApp; participant counts and registrations cannot be measured.
- Local initiatives are invisible to other groups; reusable ideas don't propagate.
- New members can't easily find a path in; recruitment depends on personal networks.

The goal of this project is a digital platform that centralizes representation, membership, organization, and cross-group synergies, without throwing away the existing WordPress content site.

---

## 2. Strategic Architecture Decision

The platform is **hybrid**:

- **WordPress** remains the public **content layer**: marketing pages, Alevi values content, blog, local group profile pages, project showcases. Edited by board members without developer involvement.
- **A custom modular application** (this spec) is the **structured-data layer**: authentication, members, events, admin, board tooling. Lives in a Git repository, deployed independently of WordPress.
- The two are linked through (a) **single sign-on** so a logged-in user is recognized on both, and (b) a **shared design system** so the visual transition is invisible to the user.

**Why hybrid:** WordPress is good at content, bad at structured workflows; a custom app is the inverse. Splitting them prevents WordPress plugin sprawl from becoming the system of record for membership data, and isolates volunteer developer effort to the part that actually requires it.

---

## 3. Goals and Non-Goals

### Goals (v1)
- Standardize the membership process: register, verify, track, contact members.
- Centralize event creation and registration; produce reliable participation metrics.
- Provide every local group with a profile page sourced from real data, not hand-edited HTML.
- Provide the federal and local boards with an admin view: member tables, event statistics, group activity.
- Provide a board-handover module so processes, roles, and contacts persist across elections.
- Make membership optionally paid (small voluntary yearly contribution) without making payment a barrier to joining. 
- Provide file repository for all members, access based on role

### Non-Goals (explicitly out of scope for v1)
- Native mobile apps (the platform is mobile-responsive web only).
- Replacing WhatsApp as the day-to-day chat channel.
- Internal social-network features (DMs, feeds, comments).
- Replacing WordPress for blog and content pages.
- Multi-federation tenancy — this is for BDAS only.

---

## 4. Stakeholders and User Roles

| Role | Description | Authenticated | Can do |
|------|-------------|---------------|--------|
| Visitor | Anyone on the public web | No | Read public content, view event list, view local groups, start registration, donate money |
| Member | Registered, active student in a local group | Yes | Manage profile, register and deregister for events, see member directory of own group, see internal announcements, change group, access to member folder |
| Paying Member | Member who has opted into voluntary dues | Yes | All Member rights; flagged in admin |
| Local Board (Lokaler Vorstand) | Elected board of one Hochschulgruppe | Yes | All Member rights; manage own group's events, members, projects, profile page; access local handover docs; decide if payment for joining the local group wanted, make posts in blog, send e-mail to registered members of Local Group, access to member folder + local board shared folder |
| Federal Board (Bundesvorstand) | Elected federation board | Yes | All Local Board rights across all groups; cross-group statistics; manage groups themselves; manage announcements; set and unset members to Local Board role, access to Federal board folder + all other folders |
| Alumni | Member who has graduated | Yes (downgraded) | Read-only access to network, opt-in newsletter, no event registration unless re-flagged |

A user holds **one base role** plus any number of **scoped role grants** (e.g. user X is Member with role grant `local_board:moenchengladbach`).

---

## 5. Modular Architecture Principles

The application is built as a set of modules with **explicit boundaries**. The intent is that any single module can be replaced, removed, or rewritten without rippling through the others.

**Rules of modularity (these must be enforced; restate them in every per-module prompt):**

1. **One module owns its tables.** No other module reads or writes those tables directly. Cross-module access goes through a typed service interface exported from the module.
2. **Modules depend on interfaces, not implementations.** A module that needs to send email imports a `Notifier` interface; the actual email driver is wired up at composition time.
3. **No circular dependencies between modules.** If A needs B and B needs A, one of them is wrong.
4. **Shared concerns live in `core/`** — types, errors, IDs, dates, money, logging. Business modules never import each other's internals; they may import from `core/`.
5. **Each module has its own folder, its own README, and its own tests.** The folder is the unit of ownership.
6. **Feature flags gate every new module** at the route layer so half-built modules can be merged without breaking production.
7. **Database migrations are namespaced per module.** A module's migrations live with it and are runnable in isolation.
8. **A module's public surface is a single `index.ts` (or equivalent) that re-exports its types, services, and route handlers.** Anything not re-exported is private.

### Suggested folder layout

```
/apps
  /web              # Public site — Next.js. Marketing, group profiles, event browsing, donations, /account
  /dashboard        # Boards-only surface — separate Next.js app, deployed at dashboard.bdas.de
/modules
  /auth             # Sessions, login, registration, password reset, SSO bridge to WordPress
  /members          # Profile, membership lifecycle, alumni transition, group changes
  /groups           # Local groups (Hochschulgruppen) — registry, profile, contact, per-group join policy
  /events           # Event CRUD, registration, deregistration, calendar, attendance
  /files            # Role-scoped file repository
  /projects         # Local project showcases, cross-group visibility
  /dashboard-shell  # Sidebar, navigation, layout primitives, role-scoped routing for /apps/dashboard
  /handover         # Board handover templates, role docs, contact continuity
  /payments         # Stripe integration: donations (visitor), voluntary yearly dues, per-group join fees
  /notifications    # Email, in-app announcements, transactional sends, group-scoped broadcasts
  /content-bridge   # Pulls public content from WordPress REST API, syncs author roles for blog
/core
  /db               # DB client, migration runner
  /id               # ID generation
  /errors           # Shared error types
  /design-system    # Tokens, primitives, shared components (also consumed by WP theme)
  /storage          # Object-store client wrapper used by /files
  /types            # Cross-module shared types only
/infra
  /migrations       # Aggregated migration runner that calls per-module migrations in order
```

---

## 6. Tech Stack

Pinned to keep the AI builder predictable. Substitute only if you have a specific reason.

- **Language:** TypeScript end-to-end.
- **Framework:** Next.js 14 (App Router). Server Components for reads, Server Actions or route handlers for writes.
- **Database:** PostgreSQL (Supabase or Neon for managed hosting).
- **ORM:** Drizzle (lightweight, modular schemas — better fit than Prisma for the per-module migration model).
- **Auth:** Lucia or Auth.js, configured for email + password and a WordPress SSO bridge.
- **Object storage:** Supabase Storage or Vercel Blob (S3-compatible). Used exclusively by the `files` module.
- **Styling:** Tailwind CSS + shadcn/ui primitives.
- **Email:** Resend.
- **Payments:** Stripe (Checkout for donations and join fees, Customer Portal for recurring dues).
- **Hosting:** Vercel for the app; WordPress stays where it is.
- **Repository:** Single Git repository (monorepo) using pnpm workspaces. One repo, many modules.
- **CI:** GitHub Actions: typecheck, test, lint, migration dry-run on every PR.

---

## 7. Module: `auth`

**Purpose:** Identity, sessions, and the SSO bridge to WordPress. Owns nothing about the user's profile beyond credentials.

**Owns the tables:** `auth_users`, `auth_sessions`, `auth_password_resets`, `auth_email_verifications`.

**Public interface (what other modules consume):**
- `getCurrentUser(req): { userId, email, roles[] } | null`
- `requireRole(req, role)` — throws/redirects if not authorized
- `events: 'user.registered' | 'user.email_verified' | 'user.deleted'` — emitted on a typed event bus

**Capabilities:**
- Email + password registration with email verification (mandatory before any role grant).
- Login, logout, "remember me" 30-day cookie session.
- Password reset by emailed token, 1-hour expiry.
- WordPress SSO bridge: a logged-in app user gets a signed cookie that the WP theme reads to show "Hi, $name" without a second login.
- Rate limiting on `/login` and `/register` (5/15min per IP).

**Out of scope for this module:** profile data, membership status, payment, group assignment, role grant CRUD. Those live in `members`, `payments`, and the `dashboard` app respectively.

---

## 8. Module: `members`

**Purpose:** Everything about a person as a member of BDAS — profile, lifecycle, alumni transition, group changes.

**Owns the tables:** `members`, `member_role_grants`, `member_status_history`, `group_change_requests`.

**Schema sketch:**
```
members
  id, auth_user_id (fk), first_name, last_name, phone, university,
  field_of_study, expected_graduation, primary_group_id (fk -> groups),
  status (enum: pending | active | inactive | alumni),
  paying (bool), joined_at, last_verified_at, alumni_since (nullable)

member_role_grants
  id, member_id, scope (e.g. 'federal_board' | 'local_board:moenchengladbach'),
  granted_at, granted_by, revoked_at (nullable)

member_status_history
  id, member_id, from_status, to_status, reason, at, by

group_change_requests
  id, member_id, from_group_id, to_group_id, status (pending | approved | rejected),
  requested_at, decided_at (nullable), decided_by (nullable), reason (nullable)
```

**Capabilities:**
- Member profile CRUD (self-service for own profile; local board can edit members of own group).
- Membership lifecycle: `pending` → `active` (after local board approval) → `inactive` (annual re-verification fails) → `alumni` (manual or triggered by graduation date passing).
- Annual re-verification: every 12 months from `last_verified_at`, member receives an email asking them to confirm; one click sets `last_verified_at = now`. Two missed reminders → `inactive`.
- Alumni transition: on graduation date or manual flag, member becomes `alumni`, retains read-only network access, opts in/out of alumni newsletter.
- **Group change flow:** member opens "Change my group" in `/account`, picks a new group, submits a request. Notification fires to the *receiving* group's local board. Approved → `primary_group_id` updated; rejected → member can pick a different group. While pending, member retains rights on the source group.
- Member directory (list of members in own group, with privacy controls — members choose what's visible).

**Public interface:**
- `getMember(memberId)`, `getMemberByAuthUser(userId)`
- `listMembersByGroup(groupId, filters)`
- `transitionStatus(memberId, toStatus, reason)`
- `requestGroupChange(memberId, toGroupId)`, `decideGroupChange(requestId, decision, decidedBy)`
- `grantRole(memberId, scope, grantedBy)`, `revokeRole(grantId, revokedBy)` — guarded so only callers with sufficient privilege succeed
- `events: 'member.activated' | 'member.alumni' | 'member.deleted' | 'member.group_changed' | 'role.granted' | 'role.revoked'`

---

## 9. Module: `groups`

**Purpose:** The registry of Hochschulgruppen (local groups). Each group has a profile page, contact info, board, activity feed, and its own join policy.

**Owns the tables:** `groups`, `group_contacts`.

**Schema sketch:**
```
groups
  id, slug, name, university, city, founded_at, status (active | dormant | archived),
  description_md, logo_url, contact_email, social_links_json,
  join_fee_required (bool, default false),
  join_fee_amount_cents (int, nullable),
  join_fee_period (enum: 'one_time' | 'yearly', nullable),
  join_fee_currency (default 'EUR')

group_contacts
  id, group_id, role_label, member_id (fk), public (bool)
```

**Capabilities:**
- Public group profile page at `/gruppen/[slug]` — sourced from this module, NOT from WordPress.
- Local board can edit own group's profile and toggle the group's join-fee policy (whether joining requires payment, how much, and whether one-time or yearly).
- Federal board can create, archive, and override group settings.
- Group activity feed = aggregation pulled from `events` and `projects` modules via their public interfaces (no direct table access).

**Public interface:**
- `getGroup(idOrSlug)`, `listGroups(filters)`
- `getJoinPolicy(groupId): { required, amountCents, period }` — consumed by `members` registration flow and by `payments` to gate activation
- `events: 'group.created' | 'group.archived' | 'group.join_policy_changed'`

---

## 10. Module: `events`

**Purpose:** Event creation, registration, deregistration, attendance, calendar.

**Owns the tables:** `events`, `event_registrations`, `event_attendance`.

**Schema sketch:**
```
events
  id, group_id (fk, nullable for federal events), title, description_md,
  starts_at, ends_at, location, location_url, capacity (nullable),
  visibility (enum: public | members_only | group_only),
  status (draft | published | cancelled), created_by, created_at

event_registrations
  id, event_id, member_id (fk), registered_at, cancelled_at (nullable),
  waitlist_position (nullable)

event_attendance
  id, event_id, member_id, attended (bool), checked_in_at, checked_in_by
```

**Capabilities:**
- Local board creates events for own group; federal board creates federation-wide events.
- Members register with one click and **deregister with one click**; deregistration before the event start auto-promotes the next person on the waitlist and notifies them.
- Capacity enforcement with automatic waitlist; visible position to the member.
- Event list page filterable by group, time range, visibility.
- ICS feed per group and federation-wide (`/gruppen/[slug]/events.ics`).
- Check-in interface for the day-of (board scans/marks attendance).
- Post-event metrics: registered vs attended, surfaced to the dashboard app.

**Public interface:**
- `listUpcomingEvents(filters)`, `getEvent(id)`
- `registerMember(eventId, memberId)`, `cancelRegistration(eventId, memberId)`
- `events: 'event.published' | 'event.registered' | 'event.deregistered' | 'event.cancelled'` (consumed by `notifications`)

---

## 11. Module: `files`

**Purpose:** Role-scoped file repository so members and boards can share documents, templates, and resources without resorting to private cloud drives.

**Owns the tables:** `folders`, `files`, `file_access_log`.

**Schema sketch:**
```
folders
  id, slug, name,
  scope (enum: 'members_all' | 'group_members' | 'local_board' | 'federal_board'),
  group_id (fk, nullable — required when scope is 'group_members' or 'local_board'),
  description, created_at, created_by

files
  id, folder_id, filename, storage_key, mime_type, size_bytes,
  uploaded_by, uploaded_at, last_modified_at

file_access_log
  id, file_id, member_id, action (download | view | upload | delete), at
```

**Folder taxonomy** (created automatically; not user-creatable in v1):

| Scope | Cardinality | Read | Write |
|-------|-------------|------|-------|
| `members_all` | 1 | every active member | federal board |
| `group_members:[group_id]` | 1 per group | members of that group | that group's local board |
| `local_board:[group_id]` | 1 per group | that group's local board, federal board | that group's local board |
| `federal_board` | 1 | federal board | federal board |

**Capabilities:**
- Upload, list, download, delete, replace — all gated by the table above and enforced server-side.
- File-size cap (default 25 MB) and per-folder quota (default 5 GB) enforced before upload.
- Object store interactions go through `core/storage`; the app never proxies file bytes — uploads and downloads use signed URLs.
- All access logged in `file_access_log` for audit; logs surfaced in the dashboard app.

**Public interface:**
- `listFolders(forMember)` — returns only folders the member can read
- `listFiles(folderId, forMember)`, `getDownloadUrl(fileId, forMember)`
- `uploadFile(folderId, file, byMember)`, `deleteFile(fileId, byMember)`
- All methods enforce permissions internally — no caller can bypass by forging IDs.

**Out of scope for v1:** versioning, full-text search, public share links, in-app previews beyond MIME-type icons, comments on files, nested folders.

---

## 12. Module: `projects`

**Purpose:** Showcase local initiatives so other groups can discover and reuse them.

**Owns the tables:** `projects`, `project_updates`.

**Capabilities:**
- Local board posts a project (title, description, status, contact, optional artifacts).
- Cross-group browsing at `/projekte`, filterable by topic and group.
- "Adopt this project" button → creates a copy scoped to the adopting group.
- Project updates (changelog-style posts) for ongoing visibility.
- Attached resources are stored via the `files` module under the relevant `local_board` folder (no parallel storage in this module).

---

## 13. Dashboard App: `apps/dashboard`

**Important:** The dashboard is a **separate Next.js app**, not a route group inside the public site. It is deployed at `dashboard.bdas.de` (or `app.bdas.de` if a single sub-domain is preferred). The public site never renders dashboard pages, and the dashboard never renders public marketing pages. They share the design tokens in `core/design-system` and the SSO cookie, nothing else.

**Why a separate app:** the public site and the dashboard have different information density, different UI vocabulary (sidebar + tables vs. editorial layout), different release cadences, and different security postures. Splitting them keeps each one focused and lets the public site stay fully cacheable.

**One dashboard, role-scoped views.** Local board and federal board use the **same dashboard app**. What they see is determined by their `member_role_grants`. A user with both `local_board:moenchengladbach` and `federal_board` sees both scopes in a scope-switcher in the sidebar — they don't switch URLs.

**Composition:** the dashboard is the consumer of every other module's public interface. It owns no business tables of its own. Its module folder, `dashboard-shell`, contains only the layout shell, sidebar navigation, scope-switcher, and routing helpers. All data and actions delegate to other modules.

### Routing

```
dashboard.bdas.de/
├── /                         # Landing — scope picker if user has multiple grants
├── /federal                  # Federal board scope (requires federal_board grant)
│   ├── /overview             # Tiles + charts
│   ├── /members              # All-federation member table
│   ├── /events               # All events table
│   ├── /groups               # Groups registry, create/archive
│   ├── /roles                # Role grant management — grant/revoke local_board, federal_board
│   ├── /broadcasts           # Federation-wide email composer
│   ├── /payments             # Donations YTD, dues, join-fee revenue
│   └── /files                # All file folders, access logs
├── /gruppe/[slug]            # Local board scope (requires local_board:[slug] grant)
│   ├── /overview             # Group-scoped tiles + charts
│   ├── /members              # Group roster, approve pending, decide group-change requests
│   ├── /events               # Group's events, create/edit
│   ├── /profile              # Edit group profile (delegates to groups module)
│   ├── /join-policy          # Toggle join-fee requirement and amount
│   ├── /broadcast            # Email composer for own group only
│   ├── /handover             # Checklists + linked files folder
│   ├── /projects             # Group's project showcases
│   └── /files                # group_members + local_board folders
└── /account                  # Personal account settings (every authenticated user)
```

### Federal board capabilities (under `/federal`)
- Tiles: total active members, paying members, total yearly dues received, donations YTD, new signups (7d/30d), upcoming events, groups by status.
- Tables: all members (filterable by group, status, role, paying), all events, all groups.
- **Role grant management:** search any member, grant or revoke `local_board:[group]` and `federal_board`. Calls `members.grantRole / revokeRole`. All grants and revocations appear in an audit log.
- Charts: signups over time, event attendance over time, payments over time.

### Local board capabilities (under `/gruppe/[slug]`)
- Same shape as federal view but scoped to own group.
- Member roster with re-verification status; one-click approve/reject for `pending` members and incoming group-change requests.
- Event creation shortcuts.
- Group join-policy editor (delegates to `groups.updateJoinPolicy`).
- "Email this group" composer (delegates to `notifications.broadcastToGroup`).
- Handover documents (linked from `handover` module).
- File repository links (`local_board:[group_id]` and `group_members:[group_id]`).

### Access enforcement
- Every dashboard route is gated at the edge by middleware that reads the SSO session and checks for the required role grant. No grant → redirect to public site.
- A user with no board grants who lands on `dashboard.bdas.de` is bounced to `/account` on the public site. The dashboard is invisible to non-board users.
- Federal board grants are super-set: holding `federal_board` grants implicit access to every `/gruppe/[slug]` view.

**Hard rule:** The dashboard app reads via `members.listMembers(...)`, `events.listEvents(...)`, etc. It does NOT issue raw SQL against other modules' tables. Treat it like any other consumer of the module API surface.

---

## 14. Module: `handover`

**Purpose:** Solve the recurring board-handover failure mode. When a local board changes, processes, contacts, passwords, and accumulated experience must transfer cleanly.

**Owns the tables:** `handover_checklists`, `handover_credential_refs`.

**Storage of documents:** handover documents are not stored in this module — they live in the `files` module under the relevant `local_board:[group_id]` folder. This module owns *workflow* (checklists, role docs, transition state); it does not duplicate file storage.

**Capabilities:**
- Per-group, per-role checklist of handover items, customizable from a federation-provided template.
- Credential vault stub: stores *references* to shared accounts (e.g. "Mailchimp: ask the federal IT contact"); never stores passwords.
- "Outgoing board" view: a one-screen summary of everything to transfer, with a button to invite the incoming board members and grant role.
- Knowledge persists across role transitions — when a `member_role_grants` row is revoked, the documents stay.

This is the module that turns "Vorstandswechsel" from a recurring crisis into a workflow.

---

## 15. Module: `payments`

**Purpose:** All money in. Three distinct flows, one module.

**Owns the tables:** `payment_intents`, `subscriptions`, `donations`.

**Three transaction types:**

1. **Donations (visitor flow).** Anyone — including unauthenticated visitors — can donate via a `/spenden` page. Stripe Checkout one-off, optional name + email for receipt. Stored in `donations` with no member link unless the donor is logged in. Anonymous donations are allowed.
2. **Voluntary yearly member dues.** A logged-in member can opt into yearly dues via `/account/membership`. Stripe recurring subscription. Webhook syncs `members.paying = true` and `members.last_payment_at`. Cancellation handled via Stripe Customer Portal; access never lapses for non-payment because dues are voluntary.
3. **Per-group join fee.** When a `pending` member is approved by a local board whose `groups.join_fee_required = true`, the member is prompted to pay the fee before becoming `active`. Fee is `one_time` or `yearly` depending on `join_fee_period`. The fee gates *activation in that group*, nothing more — failing to pay does not delete the member, it just keeps them `pending`.

**Capabilities:**
- Stripe Checkout for one-time payments (donations, one-time join fees).
- Stripe subscriptions for recurring (dues, yearly join fees).
- Stripe webhooks: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.
- Receipts emailed via `notifications`.
- Federal board sees aggregate financial dashboard via the `dashboard` app at `dashboard.bdas.de/federal/payments`.

**Hard rules:**
- `members.status` is independent of voluntary-dues status.
- Donations are independent of membership entirely.
- The module never stores card data — Stripe holds it; the app holds only customer/subscription IDs.

**Public interface:**
- `createDonationCheckout(amountCents, donorEmail?)` → URL
- `createDuesSubscription(memberId)` → URL
- `createJoinFeeCheckout(memberId, groupId)` → URL
- `events: 'donation.received' | 'dues.activated' | 'dues.cancelled' | 'join_fee.paid'`

---

## 16. Module: `notifications`

**Purpose:** Outbound communication. Subscribes to events from other modules and sends emails / shows in-app notices.

**Capabilities:**
- **Transactional emails:** verify email, password reset, event registration confirmation, deregistration confirmation, waitlist promotion, re-verification reminder, alumni welcome, group-change request received, group-change request decided, role granted/revoked, donation receipt, dues confirmation, join-fee receipt.
- **Federal broadcast:** federal board sends to all members or a filtered subset (group, role, status).
- **Local broadcast (`broadcastToGroup`):** local board composes and sends an email to all members of their own group, with optional filters (e.g. only registered for an upcoming event). Local boards cannot send outside their own group.
- Per-user preferences: which categories the user accepts. Transactional emails are non-optional.
- All sends logged in `notification_log` for audit and debugging; logs visible in the dashboard app.

**Public interface:**
- `sendTransactional(template, toMemberId, data)`
- `broadcastToGroup(groupId, byMemberId, subject, bodyMd, filters?)` — caller must hold `local_board:[groupId]` or `federal_board`
- `broadcastFederal(byMemberId, subject, bodyMd, filters?)` — caller must hold `federal_board`

---

## 17. Module: `content-bridge`

**Purpose:** Make WordPress content reachable from the app, and make app role grants reachable from WordPress.

**Capabilities:**
- **Read side:** calls WordPress REST API (`/wp-json/wp/v2/posts`, `/pages`) with caching. Used by the homepage, "Alevitische Werte" page, and group profile pages that embed an editorial intro.
- **Write side (role sync):** when a member receives a `local_board:[group_id]` or `federal_board` grant, the bridge ensures they hold the corresponding **WordPress author role** (with a per-group category restriction enforced by a small WP plugin). On revocation, the author role is removed. This is what enables "make posts in blog" — local board members write blog posts in WordPress, scoped to their group's category, with no second login required thanks to SSO.
- Read-only with respect to post content; the app never writes blog posts back to WordPress.

This module is the only place WordPress is referenced. If WordPress is ever retired, only this module changes.

---

## 18. Cross-Cutting: Authentication and SSO Across Public Site, Dashboard, and WordPress

- The `auth` module is the source of truth for identity. The public site (`bdas.de`), the dashboard (`dashboard.bdas.de`), and WordPress all trust a signed cookie issued by it.
- Implementation: `auth` sets a JWT cookie scoped to the parent domain (`Domain=.bdas.de`) so all three surfaces see it without separate logins.
  - Public site reads it server-side to render `/account` and to gate event registration.
  - Dashboard reads it in middleware to gate every route by role grant.
  - A small WordPress plugin reads it, hydrates the WP user, and maps role grants to WP capabilities (Author restricted by category for `local_board`, Editor for `federal_board`).
- Logout in any one surface clears the cookie everywhere.
- This is one-way: WordPress logins do not authenticate against the app. (Avoids two writable identity stores.)
- The WP plugin lives in the same monorepo under `/wp-plugin/bdas-sso` and is versioned alongside the app.

---

## 19. Data Migration from Current State

- **WordPress posts and pages:** stay where they are. The app links to them.
- **Existing member lists** (spreadsheets, WhatsApp): out of scope to import automatically. Boards will re-onboard via a one-time bulk-invite tool in `members` (CSV upload → invitation emails).
- **Existing event history:** not migrated. Events module starts fresh.
- **Existing files:** not migrated automatically. Boards upload current handover docs, templates, and group resources into the `files` module during Phase 4.

---

## 20. Non-Functional Requirements

- Mobile-first responsive (target devices: 375px, 768px, 1280px).
- WCAG 2.1 AA accessibility.
- German as primary language; English as secondary, switchable.
- GDPR: explicit consent at registration, data export self-service in `/account`, account deletion that cascades to all modules within 30 days. File-access logs retained 90 days, payment records retained per German tax-law minimums.
- Cookie banner with privacy-preserving defaults.
- Rate limits on all auth and write endpoints, plus a stricter limit on `/spenden` (donation creation) to prevent payment-form abuse.
- All PII encrypted at rest by the database provider; passwords hashed with argon2id.
- File storage: 25 MB per file default cap, 5 GB per folder default quota, both configurable per scope by federal board.
- Logging: structured, no PII in logs.
- Backups: daily DB and object-store backups with 30-day retention.

---

## 21. Repository and Deployment Structure

- One Git repository, pnpm workspaces. Two deployable Next.js apps (`/apps/web`, `/apps/dashboard`), shared modules under `/modules`, plus a `wp-plugin/` workspace for the WordPress SSO plugin.
- Each app has its own Vercel project: `web` at `bdas.de`, `dashboard` at `dashboard.bdas.de`. They share the same database, Stripe account, and object store.
- Branch model: `main` is production, PRs from feature branches, required CI checks (typecheck, lint, test, migration dry-run) run once across the monorepo.
- Deployments: every PR gets two preview URLs (one per app); merge to `main` deploys both to production. The WP plugin is built as a zip artifact on each release tag and uploaded to the WordPress install manually (or via WP-CLI).
- Environment variables documented in `/.env.example` at repo root and per-module `.env.example`.
- Secrets in Vercel + GitHub Actions secrets, never committed.
- README at repo root explains the modular boundary rules; each module has its own README explaining its public interface.

---

## 22. Build Phases

The platform is delivered in phases. Each phase is independently shippable. Do not start phase N+1 until phase N is in production.

1. **Phase 1 — Foundation.** `auth`, `members` (without group-change), `groups` (without join-fee policy), `core/design-system`, `content-bridge` (read side only). Public site can render groups; users can register; SSO into WordPress works.
2. **Phase 2 — Events + comms + files.** `events`, `notifications` (transactional + group broadcast), `files`. Members can register/deregister for events; boards can email their group; member, group-shared, and board folders go live.
3. **Phase 3 — Dashboard.** Stand up `apps/dashboard` at `dashboard.bdas.de` with `dashboard-shell`, the federal scope (`/federal/*`), and the local scope (`/gruppe/[slug]/*`). Includes member, event, and file-access tables, plus the **role grant management UI** for federal board. SSO middleware blocks access for users without board grants.
4. **Phase 4 — Handover.** `handover` module. Documents stored via `files`. Solves the recurring board-transition pain.
5. **Phase 5 — Synergies.** `projects` module with cross-group discovery; `content-bridge` write side (role sync) so local boards can author blog posts in WordPress.
6. **Phase 6 — Money.** `payments` covering donations, voluntary yearly dues, and per-group join fees. Group-change flow and join-policy editor in `groups` ship here.

---

## 23. Acceptance Criteria (Phase 1)

The platform is "Phase 1 done" when:
- A new visitor can register, verify email, log in, log out, reset password.
- A logged-in user is recognized on WordPress without a second login.
- A federal board member can create a new group, edit it, and archive it.
- A local board member can edit their own group's profile and approve a pending member.
- A user can view all groups at `/gruppen` and a single group at `/gruppen/[slug]` with content sourced from the database (not WordPress).
- All Phase 1 modules pass their own test suites in CI.
- All pages pass Lighthouse accessibility audit ≥ 90 on mobile.

---

## 24. How to Prompt an AI Builder With This Spec

The point of the modular layout is that you never paste this whole document into a builder. You paste:

1. **Sections 1–6** (always — context + architecture rules).
2. **The single module section** you are building right now.
3. **The interfaces of any modules it depends on** (just the "Public interface" subsection).

A typical prompt looks like:

> *"Build the `events` module of the BDAS platform per the spec below. Follow the modular architecture rules in section 5 strictly: this module owns only the tables listed, and consumes other modules through their public interfaces. Use the tech stack in section 6. Generate: schema migrations, service layer, route handlers, UI pages for `/events` and `/events/[id]`, and tests for the registration + waitlist + deregistration logic.*
>
> *[paste sections 1–6]*
> *[paste section 10 — events]*
> *[paste public interfaces from sections 8 (members), 9 (groups), and 16 (notifications) only]*"

After the AI generates the module, **review against section 5 rules before merging**. The single most common failure mode is a module reaching into another module's tables; reject any PR that does this.

---

## 25. Open Questions for the Federation to Decide

These are not blockers for Phase 1 but should be answered before the corresponding phase:

- Is membership renewal automatic each year, or does it require an explicit action?
- Should alumni retain access to event registration, or only to read-only views?
- Will dues be a single tier or a free-amount-with-minimum?
- Who gets to grant `federal_board` role? (Bootstrapping question.)
- What happens to a group that becomes `dormant` for >12 months — auto-archive, or manual?
- Final domain choice: `bdas.de` for public + `dashboard.bdas.de` for the boards (recommended), or `app.bdas.de/dashboard` under a single sub-domain? The cookie scope (`Domain=.bdas.de`) works for either.
- **When a member changes group**, do per-group join fees carry over, or is the fee re-charged at the new group?
- **Donation receipts**: must they be tax-compliant (Spendenbescheinigung)? If yes, the donations flow needs to capture full postal address and produce a PDF — a sub-feature of `payments`.
- **File quotas** (25 MB / 5 GB defaults): do these match the kinds of files boards actually want to share (videos, scanned documents, archives)? Adjust before Phase 2.
- **Local board email broadcast**: is there an approval step (federal board sees a copy), or is it free-send within own group?

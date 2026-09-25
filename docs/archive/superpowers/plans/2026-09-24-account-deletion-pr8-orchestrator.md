# Konto-Löschung PR8 — Orchestrator & 30-Tage-Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Cron-Sweep löscht nach Ablauf der 30 Tage unwiderruflich und wiederaufnehmbar: files → blog → events → notifications → `auth.deleteAccount` → E-Mail C, mit persistiertem Fortschritt, den zwei geparkten Fixes (Files-Race, Blog-Medien) und geleertem PII-Snapshot.

**Architecture:** Die Engine (`runAccountDeletionSweep`) lebt in `modules/auth` (besitzt `account_deletion_*`), kennt aber keine anderen Module: Die Modul-Schritte kommen als injizierte `DeletionStep[]` aus `apps/web` (Composition Root). Das ist nötig, weil `files → members → auth` besteht; ein Import `auth → files` wäre ein Zyklus (Rule 3) und ein Verstoß gegen Rule 2. Ein Request wird per Lease (`claimed_until`) atomar beansprucht; Fortschritt steht in `account_deletion_steps`; der Sweep zieht `pending`-fällige **und** hängengebliebene `in_progress`-Zeilen nach.

**Tech Stack:** TypeScript, Drizzle/Postgres (Docker, echte DB), Supabase Storage (`core/storage`), Vitest, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-09-22-account-deletion-design.md` (§2 Entscheidung 1, §3, §5, §10); `docs/decisions/0054-datenexport-csv-zip.md` (Konsequenzen).

## Global Constraints

- CLAUDE.md §1 Rules 1–8: Tabellen gehören `auth`; Module nur über `index.ts`; keine Zyklen; Migration namespaced in `modules/auth/migrations/`.
- Flag `account_deletion` gated Route/Cron (Rule 6); bleibt in Produktion **aus**, bis PR9 (E2E) grün ist.
- Tests gegen echtes Postgres (Docker), kein DB-Mock. Merge-Gate: `skipped: 0`.
- Prettier vor jedem Commit (`pnpm exec prettier --write <geänderte Dateien>`), Memory `feedback-prettier-before-commit`.
- Schritt-Reihenfolge fest: `files` → `blog` → `events` → `notifications` → `auth` → `email_c`. Reservierte Schrittnamen der Engine: `auth`, `email_c`.
- Kein Tokenwert, keine E-Mail-Adresse und kein Name in `last_error`, Logs oder Response-Body.
- Nur Tokens aus `core/design-system` — hier nicht relevant (kein UI).

## Review Focus

Die fünf Eingaben/Zustände, die die Spec nicht abdeckt und die am ehesten Schaden anrichten (jeweils mit Test im genannten Task):

1. **Reaktivierter/aktiver Nutzer trotz `in_progress`-Zeile** (Inkonsistenz, manueller Eingriff): Engine darf nie löschen, wenn `auth_users.status <> 'pending_deletion'` → Task 6.
2. **Leerer/Slash-haltiger Prefix beim Bulk-Delete** würde ganze Buckets leeren → `deleteByPrefix` verweigert alles außer `<segment>/` → Task 1.
3. **Zwei überlappende Sweeps** (Vercel doppelt, manueller Aufruf) auf demselben Request → Lease, genau eine Ausführung → Task 6.
4. **E-Mail-C-Logzeile behält die Adresse** (`sendTransactionalToGuest` schreibt `to_email`) → wird nach Versand gelöscht → Task 4/7.
5. **Absturz zwischen `deleteAccount` und Schritt-Vermerk** (User weg, `user_id` = NULL): Retry muss den Auth-Schritt als erledigt erkennen, nicht als Fehler → Task 6.

Nicht getestet, aber offen (siehe Abschnitt „Entscheidungen"): PII-Snapshot bei `cancelled`-Anfragen, Löschung von `deleteFolder`-Race, Profilfoto-Bucket.

## Entscheidungen, die du freigeben musst (bevor Task 3/5/7 starten)

1. **`notifications` bleibt als Schritt** zwischen `events` und `auth` (Spec §5 Nr. 4). In deiner Auflistung fehlte er — ich habe ihn behalten; er ist idempotent und billig. Streichen, falls bewusst.
2. **Profilfoto-Bucket (`profile-media`) wird heute bei Kontolöschung nicht geleert** — dasselbe Leck wie beim Blog, aber privater Bucket, Schlüssel `${userId}/<uuid>.<ext>` (`apps/web/app/api/profile/upload-url/route.ts:33`). Plan enthält es als **Task 8**, weil es dieselbe `deleteByPrefix`-Mechanik nutzt und „Konto gelöscht, Foto bleibt" das Versprechen in E-Mail C bricht. Streichen = Task 8 weglassen, Folge-PR.
3. **`deleteFolder` (`modules/files/src/services/folder-writes.ts`) hat dasselbe Race** wie der Purge. Task 3 fixt nur den Purge-Pfad (Scope); der Helper ist so geschnitten, dass `deleteFolder` ihn später übernehmen kann. Fix dort = eigener PR.
4. **E-Mail-C-Aufgabe:** Schlägt der Versand fehl, wird täglich neu versucht; nach 7 Tagen (ab `scheduled_purge_at`) wird ohne Mail abgeschlossen und der Snapshot trotzdem geleert. Kein neues Spaltenfeld nötig.
5. **`cancelled`-Zeilen behalten E-Mail/Name-Snapshot für immer.** Empfehlung: Folge-PR (Snapshot beim Abbruch leeren). Nicht in PR8.

## File Structure

| Datei | Verantwortung |
|---|---|
| `core/storage/src/index.ts`, `supabase.ts` | `StorageClient.deleteByPrefix` (Interface, Supabase-Impl, Stub) |
| `modules/blog/src/services/gdpr.ts`, `index.ts` | `deleteMediaByAuthor(bucket, userId)` gegen Interface `PrefixDeletableBucket` |
| `modules/files/src/services/gdpr.ts` | Ordner-Cleanup mit `FOR UPDATE` in Transaktion |
| `modules/notifications/src/services/gdpr.ts`, `index.ts` | `deleteLogEntry(db, logId)` |
| `modules/auth/migrations/0006_deletion_orchestrator.sql` | `claimed_until`, `last_error`, Snapshot-Spalten nullable |
| `modules/auth/src/schema.ts` | Spalten nachziehen |
| `modules/auth/src/services/account-deletion-sweep.ts` (+ `.test.ts`) | Engine |
| `modules/auth/src/index.ts` | Exporte `runAccountDeletionSweep`, Typen |
| `apps/web/lib/account-deletion-composition.ts` (+ `.test.ts`) | Schrittliste + Mail-Adapter verdrahten |
| `apps/web/app/api/cron/account-deletion-sweep/route.ts` (+ `.test.ts`) | Cron-Endpunkt |
| `vercel.json` | Cron-Eintrag |
| `docs/decisions/0055-*.md`, Modul-READMEs | ADR + Doku |

---

### Task 0: Worktree & Basis

- [ ] **Step 1:** Frischer Stand, Worktree anlegen (Skill `superpowers:using-git-worktrees`)

```bash
git fetch origin && git worktree add .claude/worktrees/account-deletion-pr8-orchestrator -b feat/account-deletion-pr8-orchestrator origin/main
```

- [ ] **Step 2:** `.env.local` nach `apps/web/.env.local` spiegeln (Memory `env-local-location`), `pnpm install --frozen-lockfile`, `pnpm db:up`.
- [ ] **Step 3:** Basislauf: `pnpm exec vitest run --reporter=verbose` → `skipped: 0` notieren (Referenzwert vor Änderungen).

---

### Task 1: `core/storage` — `deleteByPrefix` (geparkter Fix b, Teil 1)

**Files:**
- Modify: `core/storage/src/index.ts` (Interface + `NotConfiguredStorageClient`)
- Modify: `core/storage/src/supabase.ts`
- Test: `core/storage/src/supabase.test.ts`, `core/storage/src/index.test.ts`
- Modify: alle Test-Fakes, die `StorageClient` implementieren (`modules/files/src/index.test.ts`, `folder-access.test.ts`, `services/gdpr.test.ts` — per `pnpm typecheck` finden)

**Interfaces:**
- Produces: `StorageClient.deleteByPrefix(prefix: string): Promise<{ deleted: number }>`. Prefix-Form: genau `<segment>/` bzw. `<a>/<b>/`; jeder andere Wert wirft `Error("deleteByPrefix: invalid prefix")` **bevor** ein Netzwerkaufruf passiert.

- [ ] **Step 1: Failing Tests** (`supabase.test.ts`, nutzt dessen bestehendes Fake für `@supabase/supabase-js` — beim Lesen der Datei dessen Stil übernehmen)

```ts
describe("deleteByPrefix", () => {
  it.each(["", "/", "//", "a", "a//", "../x/", "a/../", " /", "a/b"])(
    "rejects invalid prefix %j without touching the network",
    async (prefix) => {
      const { client, calls } = makeClient();
      await expect(client.deleteByPrefix(prefix)).rejects.toThrow(/invalid prefix/);
      expect(calls).toEqual([]);
    },
  );

  it("lists and removes in pages until the prefix is empty, returns the count", async () => {
    const { client, calls } = makeClient({ objects: { "u1/": 250, "u2/": 5 } });
    await expect(client.deleteByPrefix("u1/")).resolves.toEqual({ deleted: 250 });
    expect(calls.every((c) => c.path.startsWith("u1/"))).toBe(true); // u2/ untouched
  });

  it("recurses into sub-folders", async () => { /* "u1/sub/x.png" is removed too */ });

  it("throws when list or remove reports an error (retry must see a failure)", async () => { /* … */ });
});
```

- [ ] **Step 2:** `pnpm --filter @bdas/storage exec vitest run` → FAIL (`deleteByPrefix` nicht definiert).
- [ ] **Step 3: Implementierung** in `supabase.ts`

```ts
const PREFIX_RE = /^(?:[A-Za-z0-9._-]+\/)+$/;
const PAGE = 100;
const MAX_ROUNDS = 10_000;

async deleteByPrefix(prefix: string): Promise<{ deleted: number }> {
  if (!PREFIX_RE.test(prefix) || prefix.split("/").some((s) => s === "." || s === "..")) {
    throw new Error("deleteByPrefix: invalid prefix");
  }
  return { deleted: await this.purgeDir(prefix.slice(0, -1)) };
}

private async purgeDir(dir: string): Promise<number> {
  let deleted = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await this.client.storage.from(this.bucket).list(dir, { limit: PAGE, offset: 0 });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return deleted;
    const files = data.filter((o) => o.id !== null).map((o) => `${dir}/${o.name}`);
    for (const sub of data.filter((o) => o.id === null)) deleted += await this.purgeDir(`${dir}/${sub.name}`);
    if (files.length > 0) {
      const { error: rmErr } = await this.client.storage.from(this.bucket).remove(files);
      if (rmErr) throw new Error(rmErr.message);
      deleted += files.length;
    }
  }
  throw new Error("deleteByPrefix: exceeded round limit");
}
```

Zusätzlich Interface-Methode + `NotConfiguredStorageClient.deleteByPrefix()` (`return this.fail()`). Fakes in Tests ergänzen (`deleteByPrefix: async () => ({ deleted: 0 })`).

- [ ] **Step 4:** `pnpm --filter @bdas/storage exec vitest run && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(storage): add prefix-scoped bulk delete to StorageClient`

---

### Task 2: Blog-Medien löschen (geparkter Fix b, Teil 2)

**Files:**
- Modify: `modules/blog/src/services/gdpr.ts` (Kommentar „Known gap" ersetzen)
- Modify: `modules/blog/src/index.ts` (Export)
- Test: `modules/blog/src/gdpr.test.ts`

**Interfaces:**
- Consumes: Task 1 (`deleteByPrefix`).
- Produces: `export type PrefixDeletableBucket = { deleteByPrefix(prefix: string): Promise<{ deleted: number }> }` und `deleteMediaByAuthor(bucket: PrefixDeletableBucket, userId: string): Promise<{ deleted: number }>`. Blog bekommt **keine** neue Package-Abhängigkeit auf `@bdas/storage` (Rule 2: strukturelles Interface, Verdrahtung in `apps/web`).

- [ ] **Step 1: Failing Tests**

```ts
describe("deleteMediaByAuthor", () => {
  it("deletes exactly the author's prefix", async () => {
    const calls: string[] = [];
    const bucket = { deleteByPrefix: async (p: string) => (calls.push(p), { deleted: 2 }) };
    await expect(deleteMediaByAuthor(bucket, "usr_abc")).resolves.toEqual({ deleted: 2 });
    expect(calls).toEqual(["usr_abc/"]);
  });
  it.each(["", "a/b", "../x", " "])("refuses userId %j", async (id) => {
    const bucket = { deleteByPrefix: async () => ({ deleted: 0 }) };
    await expect(deleteMediaByAuthor(bucket, id)).rejects.toThrow(/userId/);
  });
  it("propagates storage failures", async () => { /* bucket rejects → rejects */ });
});
```

- [ ] **Step 2:** `pnpm --filter @bdas/blog exec vitest run gdpr` → FAIL.
- [ ] **Step 3: Implementierung**

```ts
export async function deleteMediaByAuthor(bucket: PrefixDeletableBucket, userId: string) {
  if (!userId || /[/\\\s]|\.\./.test(userId)) throw new Error("deleteMediaByAuthor requires a plain userId");
  return bucket.deleteByPrefix(`${userId}/`);
}
```

Doc-Kommentar von `deleteContentByAuthor`: „Known gap" durch Verweis auf `deleteMediaByAuthor` ersetzen. Der Schlüssel `${userId}/<uuid>.<ext>` kommt aus `apps/web/app/api/blog/upload-url/route.ts:33` — dort ein Verweis-Kommentar ist **nicht** nötig; der Test aus Task 7 pinnt das Format.

- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(blog): delete an author's inline media on erasure`

---

### Task 3: Files-Ordner-Race (geparkter Fix a)

**Files:**
- Modify: `modules/files/src/services/gdpr.ts` (Ordner-Schleife, Doc-Kommentar „Known limitation")
- Test: `modules/files/src/services/gdpr.test.ts`

**Ursache:** Der `DELETE … WHERE NOT EXISTS(files…)` läuft mit einem Snapshot; ein gleichzeitiger `INSERT INTO files` hält nur `FOR KEY SHARE` auf der Ordnerzeile, der DELETE wartet, wertet `NOT EXISTS` danach **nicht neu** aus und kaskadiert die neue Datei weg. **Fix:** je Ordner eine Transaktion, erst `SELECT … FOR UPDATE` (wartet auf laufende Inserts, blockiert neue), dann in einem **neuen** Statement (frischer Snapshot) das `NOT EXISTS`-DELETE. Neue Inserts scheitern danach sauber am FK statt Daten zu verlieren.

**Interfaces:**
- Produces (intern): `deleteFolderIfEmpty(db: Db, folderId: string): Promise<boolean>`.

- [ ] **Step 1: Failing Test** (echte DB, zwei Verbindungen: `t.client` hat `max: 3`)

```ts
it("does not destroy a file inserted into the folder while the purge is deciding", async () => {
  const { folderId, userId, memberId } = await seedMemberWithEmptyCreatedFolder(t);

  const inserter = await t.client.reserve(); // Verbindung A
  await inserter`BEGIN`;
  await inserter`INSERT INTO files (id, folder_id, uploaded_by, filename, mime_type, size_bytes, storage_key, status)
                 VALUES (${"fil_race"}, ${folderId}, ${otherMemberId}, 'x.pdf', 'application/pdf', 1, 'k', 'ready')`;

  const purge = deleteFilesByMember(t.db, userId); // wartet auf FOR UPDATE
  await waitUntilBlocked(t.client); // poll pg_stat_activity: wait_event_type = 'Lock'

  await inserter`COMMIT`;
  inserter.release();
  await purge;

  expect(await fileExists(t, "fil_race")).toBe(true);
  expect(await folderExists(t, folderId)).toBe(true);
});
```

`waitUntilBlocked`: bis zu 2 s alle 20 ms `select 1 from pg_stat_activity where wait_event_type='Lock' and state='active' and query ilike '%for update%'` pollen; sonst Test fehlschlagen lassen (kein blindes `sleep`).

- [ ] **Step 2:** Test läuft **rot** gegen den aktuellen Code (Datei weg) — verifizieren, bevor der Fix kommt.
- [ ] **Step 3: Implementierung**

```ts
async function deleteFolderIfEmpty(db: Db, folderId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ id: folders.id }).from(folders).where(eq(folders.id, folderId)).for("update");
    if (!locked) return false;
    const child = alias(folders, "child");
    const gone = await tx.delete(folders).where(and(
      eq(folders.id, folderId),
      notExists(tx.select({ one: sql`1` }).from(files).where(eq(files.folderId, folderId))),
      notExists(tx.select({ one: sql`1` }).from(child).where(eq(child.parentId, folderId))),
    )).returning({ id: folders.id });
    return gone.length > 0;
  });
}
```

Schleife ruft `deleteFolderIfEmpty(db, folder.id)`. Doc-Kommentar „Known limitation" ersetzen durch die Erklärung oben; Hinweis auf `deleteFolder` (Entscheidung 3).

- [ ] **Step 4:** `pnpm --filter @bdas/files exec vitest run` → PASS (inkl. bestehender gdpr-Tests).
- [ ] **Step 5: Commit** `fix(files): lock folder row before empty-check in erasure purge`

---

### Task 4: `notifications.deleteLogEntry`

**Files:** Modify `modules/notifications/src/services/gdpr.ts`, `modules/notifications/src/index.ts`; Test `services/gdpr.test.ts`.

**Interfaces:** Produces `deleteLogEntry(db: Db, logId: string): Promise<void>` (idempotent, löscht genau eine Zeile per PK).

- [ ] **Step 1:** Failing Test: zwei Guest-Logzeilen (`sendTransactionalToGuest`), `deleteLogEntry` der einen → nur diese weg; zweiter Aufruf wirft nicht.
- [ ] **Step 2:** FAIL. **Step 3:**

```ts
export async function deleteLogEntry(db: Db, logId: string): Promise<void> {
  await db.delete(notificationLog).where(eq(notificationLog.id, logId));
}
```

- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(notifications): delete a single log entry by id`

---

### Task 5: Migration & Schema

**Files:**
- Create: `modules/auth/migrations/0006_deletion_orchestrator.sql`
- Modify: `modules/auth/src/schema.ts`, ggf. Aufrufer, die `emailSnapshot`/`nameSnapshot` als `string` erwarten (`pnpm typecheck` zeigt sie)
- Test: bestehende `account-deletion-request.test.ts` (Migrationsliste dort und in `delete-account.test.ts` um `0006` ergänzen)

```sql
-- PR8: orchestrator lease + error trail; snapshots become clearable after e-mail C.
ALTER TABLE account_deletion_requests
  ADD COLUMN claimed_until timestamptz,
  ADD COLUMN last_error text,
  ALTER COLUMN email_snapshot DROP NOT NULL,
  ALTER COLUMN name_snapshot DROP NOT NULL;
```

- [ ] **Step 1:** Test ergänzen: `UPDATE … SET email_snapshot = NULL` gelingt (fehlschlagend vor der Migration).
- [ ] **Step 2:** FAIL. **Step 3:** SQL anlegen, Drizzle-Schema (`claimedUntil`, `lastError`, Snapshots ohne `.notNull()`), Migration in Testlisten eintragen. Prüfen, dass `infra/migrations` (`MIGRATION_MANIFEST`) `auth` schon enthält — kein neuer Manifest-Eintrag nötig; `pnpm db:migrate:dry` grün.
- [ ] **Step 4:** `pnpm typecheck && pnpm --filter @bdas/auth exec vitest run` → PASS. **Step 5: Commit** `feat(auth): lease and clearable snapshots for the deletion orchestrator`

---

### Task 6: Engine `runAccountDeletionSweep`

**Files:**
- Create: `modules/auth/src/services/account-deletion-sweep.ts`
- Modify: `modules/auth/src/index.ts`
- Test: `modules/auth/src/services/account-deletion-sweep.test.ts` (Muster von `delete-account.test.ts`: `createTestDb`, Migrationen 0001–0006)

**Interfaces:**
- Consumes: `deleteAccount` (`delete-account.ts`), Schema aus Task 5.
- Produces:

```ts
export type DeletionStep = { readonly name: string; readonly run: (db: Db, userId: string) => Promise<void> };
export type CompletionMail = { send(to: { email: string; name: string }): Promise<"sent" | "failed"> };
export type SweepDeps = { readonly steps: readonly DeletionStep[]; readonly completionMail: CompletionMail; readonly now?: () => Date; readonly batchSize?: number };
export type SweepResult = { readonly processed: number; readonly completed: number; readonly failed: readonly { requestId: string; step: string }[] };
export function runAccountDeletionSweep(db: Db, deps: SweepDeps): Promise<SweepResult>;
```

- [ ] **Step 1: Failing Tests** (je Test eine Zeile `it`; Fixtures: `seedPendingRequest(t, { dueAt })` legt `auth_users(status='pending_deletion')` + Request an; Schritte sind Zähler-Fakes in Aufrufreihenfolge)

  1. `runs steps in the given order, then auth, then mail, and completes` — Reihenfolge-Array `["files","blog","events","notifications"]`, User weg, `status='completed'`, `completedAt` gesetzt.
  2. `ignores requests not yet due` (`scheduled_purge_at` > now) und `cancelled`/`completed`.
  3. `resumes at the failed step` — `events` wirft im ersten Lauf: `files`,`blog` je 1× gelaufen, User existiert, `status='in_progress'`, `last_error` beginnt mit `events:` und enthält weder E-Mail noch Namen; zweiter Lauf: `files`/`blog` **nicht** erneut (Zähler bleibt 1), `events`+Rest laufen, `completed`.
  4. `never deletes a user who is not pending_deletion` (Review Focus 1) — `auth_users.status='active'` + `in_progress`-Zeile: keine Schritte, User bleibt, `failed=[{step:"guard"}]`.
  5. `only one of two concurrent sweeps executes a request` (Review Focus 3) — `Promise.all([run, run])`, Schritt-Fake mit `await sleep(50)`: Zähler je Schritt = 1.
  6. `an expired lease is re-claimed; a live lease is not` — `claimed_until` Zukunft → übersprungen; Vergangenheit → wird aufgenommen.
  7. `resumes after crash between deleteAccount and the auth step marker` (Review Focus 5) — User weg (`user_id` NULL), alle Vorschritte vermerkt, kein `auth`-Vermerk: Lauf schließt ab. Ohne vermerkte Vorschritte: `failed` mit Schritt `guard`, keine Schritte laufen.
  8. `clears the snapshot only after mail C was sent` — Mail liefert `"failed"`: `email_snapshot` noch gesetzt, `status='in_progress'`, nächster Lauf sendet erneut; bei `"sent"`: Snapshots `NULL`, `completed`.
  9. `gives up on the mail after 7 days but still scrubs and completes` (Entscheidung 4).
  10. `cancel and claim are mutually exclusive` — `cancelAccountDeletion` gewinnt (Zeile `cancelled`, Sweep tut nichts) **und** umgekehrt (Sweep hat `in_progress` gesetzt → `cancelAccountDeletion` wirft `NotFoundError`).
  11. `rejects a step list that uses a reserved name` (`auth`, `email_c`).

- [ ] **Step 2:** `pnpm --filter @bdas/auth exec vitest run account-deletion-sweep` → FAIL (Modul fehlt).
- [ ] **Step 3: Implementierung** (Kern; Helper `claim`, `fail`, `finish` wie beschrieben)

```ts
const LEASE_MS = 15 * 60 * 1000;
const MAIL_GIVE_UP_MS = 7 * 24 * 60 * 60 * 1000;
const RESERVED = new Set(["auth", "email_c"]);

export async function runAccountDeletionSweep(db: Db, deps: SweepDeps): Promise<SweepResult> {
  for (const s of deps.steps) if (RESERVED.has(s.name)) throw new Error(`reserved step name: ${s.name}`);
  const now = (deps.now ?? (() => new Date()))();
  const due = await db.select({ id: accountDeletionRequests.id }).from(accountDeletionRequests)
    .where(or(
      and(eq(accountDeletionRequests.status, "pending"), lte(accountDeletionRequests.scheduledPurgeAt, now)),
      eq(accountDeletionRequests.status, "in_progress"),
    ))
    .orderBy(asc(accountDeletionRequests.scheduledPurgeAt)).limit(deps.batchSize ?? 5);

  const result = { processed: 0, completed: 0, failed: [] as { requestId: string; step: string }[] };
  for (const { id } of due) {
    const req = await claim(db, id, now);           // atomar: status→in_progress, claimed_until=now+LEASE
    if (!req) continue;                              // anderer Lauf hält die Lease
    result.processed++;
    let step = "guard";
    try {
      step = await processRequest(db, req, deps, now, (s) => (step = s));
      result.completed++;
    } catch (err) {
      await release(db, id, `${step}: ${truncate(messageOf(err))}`); // claimed_until=NULL, last_error
      result.failed.push({ requestId: id, step });
    }
  }
  return result;
}
```

`claim` = ein `UPDATE … WHERE id AND ((status='pending' AND scheduled_purge_at <= now) OR status='in_progress') AND (claimed_until IS NULL OR claimed_until < now) RETURNING *`. `processRequest`: geladene Step-Namen als `Set`; **Guard** (`userId` gesetzt und `auth_users.status !== 'pending_deletion'` → `throw`; User fehlt → alle `deps.steps` müssen vermerkt sein, sonst `throw`); Schritte in Reihenfolge (`run` → `insert … onConflictDoNothing` in `account_deletion_steps`, `id: createId("ads")`); `deleteAccount` + Vermerk `auth`; Mail-Schritt (überspringen, wenn Snapshot `NULL` oder `now - scheduledPurgeAt > 7 Tage`; `"failed"` → `throw`); Abschluss in **einer** Transaktion: Vermerk `email_c`, `status='completed'`, `completedAt`, `emailSnapshot=NULL`, `nameSnapshot=NULL`, `claimedUntil=NULL`, `lastError=NULL`. `messageOf` darf die Fehlermeldung nicht ungefiltert übernehmen, wenn sie die Snapshot-Adresse enthält: vor dem Speichern `replaceAll(req.emailSnapshot, "[redacted]")`.

- [ ] **Step 4:** Alle 11 Tests PASS, `pnpm --filter @bdas/auth exec vitest run` komplett PASS.
- [ ] **Step 5: Commit** `feat(auth): resumable account-deletion sweep engine with lease and step ledger`

---

### Task 7: Composition & Cron-Route

**Files:**
- Create: `apps/web/lib/account-deletion-composition.ts`, `apps/web/lib/account-deletion-composition.test.ts`
- Create: `apps/web/app/api/cron/account-deletion-sweep/route.ts`, `route.test.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `runAccountDeletionSweep`, `deleteFilesByMember`, `deleteContentByAuthor`, `deleteMediaByAuthor`, `clearOrganizerForUser`, `deleteLogForMember`, `deleteLogEntry`, `sendTransactionalToGuest`, `getBlogMediaStorage`.
- Produces: `buildDeletionSteps(): DeletionStep[]` (Namen `files`, `blog`, `events`, `notifications`), `completionMail: CompletionMail`.

```ts
export function buildDeletionSteps(): DeletionStep[] {
  return [
    { name: "files", run: (db, userId) => deleteFilesByMember(db, userId) },
    { name: "blog", run: async (db, userId) => {
        await deleteContentByAuthor(db, userId);
        await deleteMediaByAuthor(getBlogMediaStorage(), userId);
    } },
    { name: "events", run: (db, userId) => clearOrganizerForUser(db, userId) },
    { name: "notifications", run: (db, userId) => deleteLogForMember(db, userId) },
  ];
}

export const completionMail: CompletionMail = {
  async send(to) {
    const db = getDb();
    const r = await sendTransactionalToGuest(db, "account_deletion_completed", to, {});
    await deleteLogEntry(db, r.logId); // Review Focus 4: keine Adresse im Log
    return r.status;
  },
};
```

- [ ] **Step 1: Failing Route-Test** (Muster `files-sweep/route.test.ts`): 401 ohne/mit falschem Bearer; 200 `{ skipped: "account_deletion flag off" }` bei Flag aus; mit Flag an und leerer Tabelle 200 `{ processed: 0, completed: 0, failed: [] }`; bei `failed.length > 0` Status **500** (Cron-Fehler sichtbar), Body enthält nur `requestId`+`step`.
- [ ] **Step 2: Failing Composition-Test** (echte DB, `setStorage`/Blog-Bucket-Fake, Notifier-Fake): kompletter Sweep über echte Module — Datei-Objekt + Zeile weg, Blog-Post + Kommentare weg, **Blog-Medien unter `${userId}/` weg, fremdes Präfix `${otherUser}/` unberührt**, Event bleibt mit `created_by = NULL`, Notification-Log des Nutzers weg, **keine Logzeile mit der Snapshot-Adresse**, `account_deletion_requests`: `completed`, Snapshots `NULL`; Reihenfolge der Schrittaufrufe = `files, blog, events, notifications`.
- [ ] **Step 3:** FAIL. **Step 4: Implementierung**

```ts
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isFlagOn("account_deletion")) return Response.json({ skipped: "account_deletion flag off" });
  await bootFiles();          // Storage + MemberIdResolver
  await bootNotifications();  // Notifier + Resolver
  const result = await runAccountDeletionSweep(getDb(), { steps: buildDeletionSteps(), completionMail });
  return Response.json(result, { status: result.failed.length > 0 ? 500 : 200 });
}
```

`vercel.json`: zweiter Eintrag `{ "path": "/api/cron/account-deletion-sweep", "schedule": "0 4 * * *" }`.

- [ ] **Step 5:** `pnpm --filter @bdas/web exec vitest run account-deletion route` → PASS. **Step 6: Commit** `feat(web): account-deletion sweep cron and step composition`

---

### Task 8: Profilfoto-Bucket (nur bei Freigabe, Entscheidung 2)

**Files:** Modify `apps/web/lib/account-deletion-composition.ts` (+ Test aus Task 7 erweitern). `getProfileMediaStorage()` liefert bereits `deleteByPrefix` (Task 1).

- [ ] **Step 1:** Test erweitern: Fake-Bucket `profile-media` mit `${userId}/a.webp` und `${other}/b.webp` → nach Sweep nur ersteres weg.
- [ ] **Step 2:** FAIL. **Step 3:** Schritt `{ name: "profile_media", run: async (_db, userId) => { await getProfileMediaStorage().deleteByPrefix(`${userId}/`); } }` **nach** `blog`, vor `events`; leeren `userId` verweigert bereits `deleteByPrefix`.
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(web): purge profile photos in the deletion sweep`

---

### Task 9: Dokumentation, ADR, Archiv

- [ ] **Step 1:** `docs/decisions/0055-konto-loeschung-orchestrator.md`: injizierte Schritte statt `auth → Module`-Import; Lease + Schrittbuch; Retry-/Mail-Aufgabe-Regel (7 Tage); Ende des Abbruchfensters = Claim; Snapshot-Clearing; reservierte Schrittnamen; offene Punkte (Entscheidungen 3 und 5).
- [ ] **Step 2:** READMEs aktualisieren: `core/storage` (Prefix-Kontrakt), `modules/auth`, `modules/blog`, `modules/files` (Race behoben), `modules/notifications`. In `modules/blog/src/services/gdpr.ts` und `modules/files/src/services/gdpr.ts` sind die „parked"-Kommentare ersetzt (Tasks 2/3).
- [ ] **Step 3:** Design-Spec §5 Nr. 4 und die Angabe „Orchestrator-Funktion in `auth`" mit Verweis auf ADR 0055 präzisieren (Spec bleibt Quelle der Wahrheit; ADR gewinnt bei Konflikt).
- [ ] **Step 4:** Vor dem Verschieben Referenzen prüfen (`.ignore` schließt das Archiv von der Suche aus): `Grep` auf `2026-09-24-account-deletion-pr8-orchestrator.md` in `docs/decisions` und Modul-READMEs, Verweise auf den Archivpfad umschreiben; danach `git mv docs/superpowers/plans/2026-09-24-account-deletion-pr8-orchestrator.md docs/archive/superpowers/plans/` — **letzter Commit** des PR. Auch den bereits ausgeführten PR7-Plan mitziehen, falls noch in `docs/superpowers/plans/`.
- [ ] **Step 5:** Prettier, Commit `docs(deletion): ADR 0055, READMEs, archive PR8 plan`.

---

### Task 10: Verifikations-Gate (vor Push) & Reviews

- [ ] **Step 1: Lokal, Docker-DB läuft** — `pnpm db:up`, dann im Worktree:

```bash
pnpm typecheck && pnpm lint && pnpm exec prettier --check $(git diff --name-only origin/main...HEAD)
pnpm db:migrate:dry
pnpm exec vitest run --reporter=verbose
```

Erwartung: **`skipped: 0`**, alles PASS. Ein grüner Lauf mit `skipped > 0` zählt nicht.
- [ ] **Step 2:** `pnpm --filter @bdas/web build` (Route/`maxDuration` kompilieren).
- [ ] **Step 3:** `/code-review` (Effort `high`), Befunde einarbeiten.
- [ ] **Step 4:** `/security-review` — Prüfpunkte explizit: (a) Bearer-Vergleich und Fail-closed ohne `CRON_SECRET`; (b) Prefix-Validierung (kein Bucket-Wipe); (c) Guard gegen Löschen aktiver Konten; (d) Lease/Race Sweep↔Cancel; (e) PII in Logs, `last_error`, Response, Notification-Log; (f) Reihenfolge — `auth` erst nach allen Vorschritten; (g) Flag-Gating; (h) keine Route ohne Auth.
- [ ] **Step 5:** Erst danach Push + PR (`gh` fehlt lokal — PR im Browser öffnen oder `gh` installieren). Phasengrenze `/ultrareview` (Nutzer-getriggert) nach PR9.
- [ ] **Step 6:** Nach dem Merge: Flag bleibt **aus**; Aktivierung erst nach PR9 und Staging-Trockenlauf. **Harte Go-Live-Voraussetzung:** die echte Storage-Löschung (Blog-Medien, Profilfotos, Files) einmal im Staging gegen echte Buckets ausführen (echte `remove()`-Semantik bei fehlenden/verweigerten Pfaden) — Unit-Tests können das nicht abdecken.

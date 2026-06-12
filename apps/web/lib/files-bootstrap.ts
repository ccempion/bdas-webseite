import { getDb, type Db } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { ensureFolders, registerFilesSubscribers } from "@bdas/files";
import { setStorage, SupabaseStorageClient } from "@bdas/storage";

let booted = false;

/** Cap on how long folder provisioning may delay boot before going background. */
const BOOT_ATTEMPT_TIMEOUT_MS = 5_000;
/** Backoff schedule for background retries after a failed boot attempt. */
const RETRY_DELAYS_MS = [10_000, 30_000, 60_000];

/**
 * Idempotent files bootstrap. Wires the Supabase storage driver, subscribes to
 * groups.group.created, and provisions folders — only when the `files` flag is
 * on, so the module is inert in production until acceptance-complete (rule 6
 * applied to a non-route module). In flag-on production with missing storage
 * config we fail loud; in dev/test the NotConfiguredStorageClient stays in place
 * (folder provisioning needs no object store, so dev still works).
 *
 * Folder provisioning is deliberately NOT fail-loud (ADR 0014): a transient DB
 * connect timeout here would otherwise 500 every route on the instance. It is
 * idempotent and self-heals on the next boot or group.created event, so on
 * failure we log, keep retrying in the background, and let boot complete.
 */
export async function bootFiles(): Promise<void> {
  if (booted) return;
  if (!isFlagOn("files")) return; // not latched — a flag-off boot must not permanently disable wiring

  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const bucket = process.env["SUPABASE_STORAGE_BUCKET"] ?? "files";

  if (url && serviceRoleKey) {
    setStorage(new SupabaseStorageClient({ url, serviceRoleKey, bucket }));
  } else if (process.env["VERCEL_ENV"] === "production") {
    throw new Error(
      "[files] flag is on but SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not both set",
    );
  }

  registerFilesSubscribers(getDb());
  booted = true;

  await provisionFoldersResilient(getDb());
}

/**
 * Run ensureFolders without letting it take down boot: await it for at most
 * BOOT_ATTEMPT_TIMEOUT_MS, then continue booting and retry in the background.
 * Never throws.
 */
async function provisionFoldersResilient(db: Db): Promise<void> {
  const first = ensureFolders(db).then(
    () => true,
    (err: unknown) => {
      console.error("[files] boot folder provisioning failed:", err);
      return false;
    },
  );

  const raced = await Promise.race([first, timeoutAfter(BOOT_ATTEMPT_TIMEOUT_MS)]);
  if (raced === true) return;
  if (raced === TIMED_OUT) {
    console.error(
      `[files] folder provisioning still pending after ${BOOT_ATTEMPT_TIMEOUT_MS}ms; continuing boot, finishing in background`,
    );
  }

  void (async () => {
    if (await first) return; // the boot attempt may still land after the timeout
    for (const delayMs of RETRY_DELAYS_MS) {
      await sleep(delayMs);
      try {
        await ensureFolders(db);
        console.error("[files] folder provisioning recovered on retry");
        return;
      } catch (err) {
        console.error("[files] folder provisioning retry failed:", err);
      }
    }
    console.error(
      "[files] folder provisioning gave up after retries; folders self-heal on next boot or group.created",
    );
  })();
}

const TIMED_OUT = Symbol("timed-out");

function timeoutAfter(ms: number): Promise<typeof TIMED_OUT> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(TIMED_OUT), ms);
    t.unref?.();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(), ms);
    t.unref?.();
  });
}

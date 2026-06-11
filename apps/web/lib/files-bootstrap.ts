import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { ensureFolders, registerFilesSubscribers } from "@bdas/files";
import { setStorage, SupabaseStorageClient } from "@bdas/storage";

let booted = false;

/**
 * Idempotent files bootstrap. Wires the Supabase storage driver, subscribes to
 * groups.group.created, and provisions folders — only when the `files` flag is
 * on, so the module is inert in production until acceptance-complete (rule 6
 * applied to a non-route module). In flag-on production with missing storage
 * config we fail loud; in dev/test the NotConfiguredStorageClient stays in place
 * (folder provisioning needs no object store, so dev still works).
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
  await ensureFolders(getDb());

  booted = true;
}

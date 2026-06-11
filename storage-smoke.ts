/** Throwaway smoke: signed upload → PUT → statObject → signed download → delete. */
import { SupabaseStorageClient } from "./core/storage/src/supabase";

const url = process.env["SUPABASE_URL"]!;
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const c = new SupabaseStorageClient({ url, serviceRoleKey, bucket: "files" });
const key = `smoke/_/${Date.now()}/smoke.txt`;

void (async () => {
  const up = await c.signedUploadUrl({ storageKey: key, mimeType: "text/plain", sizeBytes: 11 });
  const put = await fetch(up.url, { method: "PUT", headers: { "content-type": "text/plain" }, body: "hello bdas\n" });
  console.log("PUT", put.status);

  const stat = await c.statObject(key);
  console.log("stat", stat);

  const dl = await c.signedDownloadUrl({ storageKey: key });
  const got = await fetch(dl.url);
  console.log("GET", got.status, await got.text());

  await c.deleteObject(key);
  console.log("deleted; stat after:", await c.statObject(key));
})();

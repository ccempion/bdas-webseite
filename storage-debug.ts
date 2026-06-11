import { createClient } from "@supabase/supabase-js";
void (async () => {
  const url = process.env["SUPABASE_URL"]!;
  console.log("URL prefix:", url.slice(0, 30) + "...");
  const c = createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {auth:{persistSession:false}});
  const list = await c.storage.from("files").list("", {limit: 10});
  console.log("list error:", list.error?.message ?? "none");
  console.log("list data length:", list.data?.length);
  const up = await c.storage.from("files").createSignedUploadUrl("smoke/test.txt");
  console.log("signedUpload error:", up.error?.message ?? "none");
  console.log("signedUpload data:", JSON.stringify(up.data));
})();

import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { sweepStalePendingUploads } from "@bdas/files";

import { bootFiles } from "../../../../lib/files-bootstrap";

export const dynamic = "force-dynamic";

/** Pending uploads older than this are abandoned and get swept. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Daily cleanup of abandoned (pending) uploads. Triggered by Vercel Cron, which
 * sends `Authorization: Bearer ${CRON_SECRET}`. No-ops when the files flag is
 * off (storage is then unconfigured, so there is nothing to sweep).
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isFlagOn("files")) {
    return Response.json({ skipped: "files flag off" });
  }
  await bootFiles(); // idempotent; wires the storage driver when the flag is on
  const swept = await sweepStalePendingUploads(getDb(), new Date(Date.now() - STALE_AFTER_MS));
  return Response.json({ swept });
}

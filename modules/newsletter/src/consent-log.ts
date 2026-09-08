/**
 * Append-only consent log — the proof under Art. 7 (1) GDPR that a consent
 * was given (spec §10). Nothing in this module ever updates or deletes a row
 * here; account deletion cascades from the subscriber.
 */
import type { Db } from "@bdas/db";

import { newsletterConsentLog } from "./schema";
import { newConsentId, type ConsentContext, type ConsentEvent } from "./types";

export async function recordConsent(
  db: Db,
  input: {
    readonly subscriberId: string;
    readonly event: ConsentEvent;
    readonly source?: string | null | undefined;
    readonly sourcePath?: string | null | undefined;
    readonly context?: ConsentContext | undefined;
  },
): Promise<void> {
  await db.insert(newsletterConsentLog).values({
    id: newConsentId(),
    subscriberId: input.subscriberId,
    event: input.event,
    ip: input.context?.ip ?? null,
    userAgent: input.context?.userAgent ?? null,
    source: input.source ?? null,
    sourcePath: input.sourcePath ?? null,
  });
}

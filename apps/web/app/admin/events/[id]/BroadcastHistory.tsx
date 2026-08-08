import type { BroadcastLogEntry } from "@bdas/notifications";

import { formatDateTime } from "../../../../lib/format";

export function BroadcastHistory({ broadcasts }: { broadcasts: ReadonlyArray<BroadcastLogEntry> }) {
  if (broadcasts.length === 0) {
    return <p className="text-sm text-bdas-ink-muted">Noch keine Nachrichten gesendet.</p>;
  }

  return (
    <div>
      {broadcasts.map((b) => (
        <details key={b.id} className="bdas-accordion">
          <summary>
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className="shrink-0 text-sm font-normal text-bdas-ink-muted">
                {formatDateTime(b.createdAt)}
              </span>
              <span className="min-w-0 flex-1 truncate">{b.subject}</span>
              <span className="shrink-0 rounded-bdas-pill border border-bdas-strong px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-bdas-ink-muted">
                {b.recipientCount} Empfänger
              </span>
            </span>
          </summary>
          <div>
            <p className="whitespace-pre-wrap">{b.body}</p>
          </div>
        </details>
      ))}
    </div>
  );
}

import type { GrantAuditEntry } from "@bdas/members";

const ROLE_LABEL: Record<string, string> = {
  federal_board: "Bundesvorstand",
  local_board_lead: "Lead",
  local_board: "Vorstand",
};

export function AuditLog({
  entries,
  groupNames,
}: {
  entries: GrantAuditEntry[];
  groupNames: Record<string, string>;
}) {
  return (
    <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
      {entries.map((e) => (
        <div
          key={`${e.memberId}:${e.role}:${e.groupId ?? ""}:${e.grantedAt.toISOString()}`}
          className="flex flex-wrap items-center gap-2 border-b border-bdas-soft px-4 py-2 text-sm last:border-b-0"
        >
          <span
            className={`rounded-bdas-sm px-2 py-0.5 text-xs font-bold ${e.revokedAt ? "bg-bdas-surface-hover text-bdas-red" : "bg-bdas-surface-hover text-bdas-ink-body"}`}
          >
            {e.revokedAt ? "ENTZOGEN" : "ERTEILT"}
          </span>
          <span className="text-bdas-ink-body">
            {ROLE_LABEL[e.role] ?? e.role}
            {e.groupId ? ` · ${groupNames[e.groupId] ?? e.groupId}` : ""} &rarr; {e.firstName}{" "}
            {e.lastName}
          </span>
          <span className="ml-auto text-xs text-bdas-ink-muted">
            {(e.revokedAt ?? e.grantedAt).toLocaleDateString("de-DE")}
          </span>
        </div>
      ))}
      {entries.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-bdas-ink-muted">Noch keine Einträge.</p>
      )}
    </div>
  );
}

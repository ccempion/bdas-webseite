import type { Folder } from "@bdas/files";

const SCOPE_LABEL: Record<Folder["scope"], string> = {
  members_all: "Alle Mitglieder",
  group_members: "Gruppenmitglieder",
  local_board: "Lokaler Vorstand",
  federal_board: "Bundesvorstand",
};

export function FoldersTable({
  folders,
  groupNames,
}: {
  folders: Folder[];
  groupNames: Record<string, string>;
}) {
  return (
    <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-bdas-ink-muted">
            <th className="p-3 text-left font-medium">Ordner</th>
            <th className="p-3 text-left font-medium">Sichtbarkeit</th>
            <th className="p-3 text-left font-medium">Gruppe</th>
          </tr>
        </thead>
        <tbody>
          {folders.map((f) => (
            <tr key={f.id} className="border-t border-bdas-soft">
              <td className="p-3 text-bdas-ink">{f.name}</td>
              <td className="p-3 text-bdas-ink-body">{SCOPE_LABEL[f.scope]}</td>
              <td className="p-3 text-bdas-ink-body">
                {f.groupId ? (groupNames[f.groupId] ?? "—") : "—"}
              </td>
            </tr>
          ))}
          {folders.length === 0 && (
            <tr>
              <td colSpan={3} className="p-6 text-center text-bdas-ink-muted">
                Keine Ordner.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

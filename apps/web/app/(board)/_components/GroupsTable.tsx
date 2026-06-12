"use client";

import { useTransition } from "react";

import type { GroupSummary } from "@bdas/groups";

import { archiveGroupAction } from "./group-actions";

const STATUS_LABEL: Record<string, string> = {
  active: "Aktiv",
  archived: "Archiviert",
  dormant: "Inaktiv",
  new: "Neu",
};

export function GroupsTable({ groups }: { groups: GroupSummary[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-bdas-ink-muted">
            <th className="p-3 text-left font-medium">Name</th>
            <th className="p-3 text-left font-medium">Stadt</th>
            <th className="p-3 text-left font-medium">Status</th>
            <th className="p-3 text-left font-medium">Aktion</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} className="border-t border-bdas-soft hover:bg-bdas-surface-hover">
              <td className="p-3 text-bdas-ink">{g.name}</td>
              <td className="p-3 text-bdas-ink-body">{g.city}</td>
              <td className="p-3">
                <span className="rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-ink-body">
                  {STATUS_LABEL[g.status] ?? g.status}
                </span>
              </td>
              <td className="p-3">
                {g.status === "active" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(() => {
                        void archiveGroupAction(g.id);
                      })
                    }
                    className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs"
                  >
                    Archivieren
                  </button>
                )}
              </td>
            </tr>
          ))}
          {groups.length === 0 && (
            <tr>
              <td colSpan={4} className="p-6 text-center text-bdas-ink-muted">
                Keine Gruppen.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

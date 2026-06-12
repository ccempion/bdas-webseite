"use client";

import { useTransition } from "react";

import type { RoleHolder } from "@bdas/members";

import { revokeRoleAction } from "./role-actions";

const ROLE_LABEL: Record<string, string> = {
  federal_board: "Bundesvorstand",
  local_board_lead: "Lead",
  local_board: "Vorstand",
};

export function RoleRoster({
  sections,
  groupNames,
  revalidatePath,
  currentMemberId,
}: {
  sections: ReadonlyArray<{ title: string; holders: RoleHolder[] }>;
  groupNames: Record<string, string>;
  revalidatePath: string;
  currentMemberId: string | null;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
      {sections.map((s) => (
        <div key={s.title}>
          <h3 className="border-b border-bdas-soft px-4 pb-2 pt-4 text-xs font-bold uppercase tracking-wide text-bdas-ink-muted">{s.title}</h3>
          {s.holders.map((h) => (
            <div key={`${h.memberId}:${h.role}:${h.groupId ?? ""}`} className="flex items-center gap-3 border-b border-bdas-soft px-4 py-2 last:border-b-0">
              <span className={`rounded-bdas-pill px-2 py-0.5 text-xs font-semibold ${h.role === "federal_board" ? "bg-bdas-red text-bdas-surface" : "bg-bdas-surface-hover text-bdas-red"}`}>
                {ROLE_LABEL[h.role]}{h.groupId ? ` · ${groupNames[h.groupId] ?? h.groupId}` : ""}
              </span>
              <span className="flex-1 text-sm text-bdas-ink">
                {h.firstName} {h.lastName}
                {currentMemberId === h.memberId && <span className="text-bdas-ink-muted"> (du)</span>}
              </span>
              {currentMemberId !== h.memberId && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => { void revokeRoleAction(h.memberId, h.role, h.groupId, revalidatePath); })}
                  className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs text-bdas-ink-body hover:bg-bdas-surface-hover"
                >
                  Entziehen
                </button>
              )}
            </div>
          ))}
          {s.holders.length === 0 && <p className="px-4 py-3 text-sm text-bdas-ink-muted">Niemand.</p>}
        </div>
      ))}
    </div>
  );
}
